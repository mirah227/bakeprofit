import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Request } from 'express';

export interface SupabaseEnvConfig {
  url: string;
  publishableKey: string;
  secretKey: string;
  isClientConfigured: boolean;
  isServerConfigured: boolean;
  missingClientKeys: string[];
  missingServerKeys: string[];
}

let cachedAdminClient: SupabaseClient | null = null;
let cachedAdminKeySignature = '';

export function getSupabaseEnv(): SupabaseEnvConfig {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const publishableKey = (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();
  const secretKey = (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim();

  const missingClientKeys: string[] = [];
  if (!url) missingClientKeys.push('SUPABASE_URL');
  if (!publishableKey) missingClientKeys.push('SUPABASE_PUBLISHABLE_KEY');

  const missingServerKeys: string[] = [];
  if (!url) missingServerKeys.push('SUPABASE_URL');
  if (!secretKey) missingServerKeys.push('SUPABASE_SECRET_KEY');

  return {
    url,
    publishableKey,
    secretKey,
    isClientConfigured: missingClientKeys.length === 0,
    isServerConfigured: missingServerKeys.length === 0,
    missingClientKeys,
    missingServerKeys,
  };
}

function inspectSecretKeyMisconfiguration(
  secretKey: string,
  publishableKey: string
): string | null {
  if (!secretKey) return null;
  if (publishableKey && secretKey === publishableKey) {
    return 'SUPABASE_SECRET_KEY matches SUPABASE_PUBLISHABLE_KEY. Set SUPABASE_SECRET_KEY to your Supabase secret/service_role key (sb_secret_... or service_role JWT), not the publishable/anon key.';
  }
  if (secretKey.startsWith('sb_publishable_')) {
    return 'SUPABASE_SECRET_KEY starts with sb_publishable_. Replace it with your Supabase secret key (sb_secret_...) or service_role key.';
  }
  if (secretKey.startsWith('eyJ')) {
    try {
      const parts = secretKey.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
          role?: string;
        };
        if (payload.role && payload.role !== 'service_role') {
          return `SUPABASE_SECRET_KEY has JWT role "${payload.role}" instead of "service_role". Replace it with your Supabase service_role or sb_secret_ key.`;
        }
      }
    } catch {
      // Ignore malformed JWT parsing
    }
  }
  return null;
}

export function getSupabaseAdmin(): SupabaseClient {
  const env = getSupabaseEnv();
  if (!env.isServerConfigured) {
    throw new Error(
      `Supabase server credentials are missing (${env.missingServerKeys.join(', ')}).`
    );
  }

  const signature = `${env.url}|${env.secretKey}`;
  if (!cachedAdminClient || cachedAdminKeySignature !== signature) {
    const isOpaqueSecretKey = env.secretKey.startsWith('sb_secret_');
    cachedAdminClient = createClient(env.url, env.secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      ...(isOpaqueSecretKey
        ? {
            global: {
              fetch: (input: RequestInfo | URL, init?: RequestInit) => {
                const headers = new Headers(init?.headers);
                if (headers.get('Authorization') === `Bearer ${env.secretKey}`) {
                  headers.delete('Authorization');
                }
                return fetch(input, { ...init, headers });
              },
            },
          }
        : {}),
    });
    cachedAdminKeySignature = signature;
  }

  return cachedAdminClient;
}

export async function getAuthenticatedSupabaseUser(req: Request): Promise<User | null> {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    return null;
  }
  return data.user;
}

const REQUIRED_TABLES = [
  'profiles',
  'recipes',
  'recipe_ingredients',
  'payment_transactions',
  'premium_subscriptions',
] as const;

export async function checkSupabaseSchemaHealth(): Promise<{
  configured: boolean;
  connected: boolean;
  tablesReady: boolean;
  missingTables: string[];
  error: string | null;
}> {
  const env = getSupabaseEnv();
  if (!env.isServerConfigured) {
    return {
      configured: false,
      connected: false,
      tablesReady: false,
      missingTables: [...REQUIRED_TABLES],
      error: `Missing environment variables: ${env.missingServerKeys.join(', ')}`,
    };
  }

  const keyMisconfig = inspectSecretKeyMisconfiguration(env.secretKey, env.publishableKey);
  if (keyMisconfig) {
    return {
      configured: true,
      connected: false,
      tablesReady: false,
      missingTables: [...REQUIRED_TABLES],
      error: keyMisconfig,
    };
  }

  try {
    const admin = getSupabaseAdmin();
    const missingTables: string[] = [];
    let firstMissingDetail: string | null = null;

    for (const table of REQUIRED_TABLES) {
      const { error } = await admin.from(table).select('*', { count: 'exact' }).limit(0);
      if (error) {
        const msg = error.message || '';
        const code = error.code || '';
        if (
          code === '42P01' ||
          code === 'PGRST205' ||
          msg.includes('does not exist') ||
          msg.includes('Could not find the table')
        ) {
          missingTables.push(table);
          if (!firstMissingDetail) {
            firstMissingDetail = `${code ? `[${code}] ` : ''}${msg}`;
          }
        } else {
          return {
            configured: true,
            connected: false,
            tablesReady: false,
            missingTables,
            error: `${code ? `[${code}] ` : ''}${msg}`,
          };
        }
      }
    }

    let exposedTablesNote = '';
    if (missingTables.length > 0) {
      try {
        const headers: Record<string, string> = { apikey: env.secretKey };
        if (!env.secretKey.startsWith('sb_secret_')) {
          headers.Authorization = `Bearer ${env.secretKey}`;
        }
        const openApiRes = await fetch(`${env.url}/rest/v1/`, { headers });
        if (openApiRes.ok) {
          const doc = (await openApiRes.json()) as {
            definitions?: Record<string, unknown>;
          };
          const exposed = Object.keys(doc.definitions ?? {});
          exposedTablesNote =
            exposed.length > 0
              ? ` Exposed public tables on this project: ${exposed.join(', ')}.`
              : ' No tables are currently exposed in the public schema on this Supabase project.';
        }
      } catch {
        // Ignore OpenAPI diagnostic failure
      }
    }

    return {
      configured: true,
      connected: true,
      tablesReady: missingTables.length === 0,
      missingTables,
      error:
        missingTables.length > 0
          ? `Tables unavailable via SUPABASE_SECRET_KEY (${missingTables.join(', ')})${firstMissingDetail ? `: ${firstMissingDetail}` : ''}.${exposedTablesNote} Ensure migrations 001 and 002 were run on the same Supabase project configured in SUPABASE_URL.`
          : null,
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      tablesReady: false,
      missingTables: [],
      error: err instanceof Error ? err.message : 'Unable to connect to Supabase.',
    };
  }
}

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

export function getSupabaseAdmin(): SupabaseClient {
  const env = getSupabaseEnv();
  if (!env.isServerConfigured) {
    throw new Error(
      `Supabase server credentials are missing (${env.missingServerKeys.join(', ')}).`
    );
  }

  const signature = `${env.url}|${env.secretKey}`;
  if (!cachedAdminClient || cachedAdminKeySignature !== signature) {
    cachedAdminClient = createClient(env.url, env.secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
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

  try {
    const admin = getSupabaseAdmin();
    const missingTables: string[] = [];

    for (const table of REQUIRED_TABLES) {
      const { error } = await admin.from(table).select('*', { head: true, count: 'exact' });
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
        } else {
          return {
            configured: true,
            connected: false,
            tablesReady: false,
            missingTables,
            error: msg,
          };
        }
      }
    }

    return {
      configured: true,
      connected: true,
      tablesReady: missingTables.length === 0,
      missingTables,
      error:
        missingTables.length > 0
          ? `Run supabase/migrations/001_bakeprofit_schema.sql in Supabase SQL Editor. Missing tables: ${missingTables.join(', ')}`
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

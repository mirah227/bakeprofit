import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
  isConfigured: boolean;
  missingKeys: string[];
  publicAppUrl?: string | null;
}

export interface SupabaseHealthStatus {
  configured: boolean;
  connected: boolean;
  tablesReady: boolean;
  missingTables: string[];
  error: string | null;
}

let cachedClient: SupabaseClient | null = null;
let cachedConfig: SupabasePublicConfig | null = null;
let initPromise: Promise<SupabaseClient | null> | null = null;

export async function fetchSupabasePublicConfig(): Promise<SupabasePublicConfig> {
  try {
    const res = await fetch('/api/supabase/config');
    if (res.ok) {
      const cfg = (await res.json()) as SupabasePublicConfig;
      cachedConfig = cfg;
      return cfg;
    }
  } catch {
    // Fallback to Vite env if server route is unavailable
  }

  const url = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
  const missingKeys: string[] = [];
  if (!url) missingKeys.push('SUPABASE_URL');
  if (!publishableKey) missingKeys.push('SUPABASE_PUBLISHABLE_KEY');

  const fallback: SupabasePublicConfig = {
    url,
    publishableKey,
    isConfigured: missingKeys.length === 0,
    missingKeys,
  };
  cachedConfig = fallback;
  return fallback;
}

export async function initSupabaseClient(): Promise<SupabaseClient | null> {
  if (cachedClient) return cachedClient;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const cfg = await fetchSupabasePublicConfig();
    if (!cfg.isConfigured || !cfg.url || !cfg.publishableKey) {
      return null;
    }

    cachedClient = createClient(cfg.url, cfg.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return cachedClient;
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

export function getSupabaseClient(): SupabaseClient | null {
  return cachedClient;
}

export function getCachedSupabaseConfig(): SupabasePublicConfig | null {
  return cachedConfig;
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  const client = await initSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

export function getAuthRedirectUrl(): string | undefined {
  const configuredPublicUrl = (
    cachedConfig?.publicAppUrl ||
    import.meta.env?.VITE_PUBLIC_APP_URL ||
    ''
  ).trim();
  if (configuredPublicUrl && /^https?:\/\//i.test(configuredPublicUrl)) {
    return `${configuredPublicUrl.replace(/\/+$/, '')}/`;
  }
  if (typeof window === 'undefined') return undefined;
  const origin = window.location.origin?.trim();
  if (!origin || origin === 'null') return undefined;
  return `${origin.replace(/\/+$/, '')}/`;
}

export interface AuthCallbackResult {
  status: 'none' | 'verified' | 'error';
  message?: string;
}

const SUPABASE_AUTH_QUERY_KEYS = [
  'code',
  'token_hash',
  'type',
  'error',
  'error_code',
  'error_description',
];

const SUPABASE_AUTH_HASH_KEYS = [
  'access_token',
  'refresh_token',
  'expires_in',
  'expires_at',
  'token_type',
  'type',
  'error',
  'error_code',
  'error_description',
];

export async function completeAuthCallbackFromUrl(
  supabase: SupabaseClient
): Promise<AuthCallbackResult> {
  if (typeof window === 'undefined') {
    return { status: 'none' };
  }

  const url = new URL(window.location.href);
  const searchParams = url.searchParams;
  const rawHash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const hashParams = new URLSearchParams(rawHash);

  const errorDescription =
    searchParams.get('error_description') ||
    hashParams.get('error_description') ||
    searchParams.get('error') ||
    hashParams.get('error');

  const hasAuthQuery = SUPABASE_AUTH_QUERY_KEYS.some((key) => searchParams.has(key));
  const hasAuthHash = SUPABASE_AUTH_HASH_KEYS.some((key) => hashParams.has(key));

  const cleanAuthUrlParams = () => {
    const nextUrl = new URL(window.location.href);
    for (const key of SUPABASE_AUTH_QUERY_KEYS) {
      nextUrl.searchParams.delete(key);
    }
    if (hasAuthHash) {
      nextUrl.hash = '';
    }
    const cleaned = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    window.history.replaceState({}, document.title, cleaned || '/');
  };

  if (errorDescription) {
    cleanAuthUrlParams();
    return {
      status: 'error',
      message: errorDescription.replace(/\+/g, ' '),
    };
  }

  const tokenHash = searchParams.get('token_hash');
  const otpType = searchParams.get('type');
  if (
    tokenHash &&
    (otpType === 'signup' ||
      otpType === 'email' ||
      otpType === 'email_change' ||
      otpType === 'recovery' ||
      otpType === 'invite' ||
      otpType === 'magiclink')
  ) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });
    cleanAuthUrlParams();
    if (error) {
      return { status: 'error', message: error.message };
    }
    if (data.session) {
      return {
        status: 'verified',
        message: 'Email verified! Your BakeProfit account is now signed in.',
      };
    }
    return { status: 'none' };
  }

  if (!hasAuthQuery && !hasAuthHash) {
    return { status: 'none' };
  }

  // Wait for @supabase/supabase-js detectSessionInUrl to finish processing #access_token or ?code
  const { data, error } = await supabase.auth.getSession();
  if (!error && data.session) {
    cleanAuthUrlParams();
    return {
      status: 'verified',
      message: 'Email verified! Your BakeProfit account is now signed in.',
    };
  }

  const authCode = searchParams.get('code');
  if (authCode && !data.session) {
    const { data: exchanged, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(authCode);
    cleanAuthUrlParams();
    if (exchangeError) {
      return { status: 'error', message: exchangeError.message };
    }
    if (exchanged.session) {
      return {
        status: 'verified',
        message: 'Email verified! Your BakeProfit account is now signed in.',
      };
    }
    return { status: 'none' };
  }

  cleanAuthUrlParams();

  if (error) {
    return { status: 'error', message: error.message };
  }

  return { status: 'none' };
}

export async function fetchSupabaseHealth(): Promise<SupabaseHealthStatus> {
  const res = await fetch('/api/supabase/health');
  return res.json();
}

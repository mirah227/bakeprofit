import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
  isConfigured: boolean;
  missingKeys: string[];
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

export async function fetchSupabaseHealth(): Promise<SupabaseHealthStatus> {
  const res = await fetch('/api/supabase/health');
  return res.json();
}

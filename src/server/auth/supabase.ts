import { createClient, type User as SupabaseUser } from '@supabase/supabase-js';

let supabaseAuthClientSingleton: ReturnType<typeof createClient> | null = null;

function trim(value: unknown) {
  return String(value || '').trim();
}

function resolveSupabaseProjectRefFromDatabaseUrl() {
  const databaseUrl = trim(
    process.env.NOVA_AUTH_DATABASE_URL ||
      process.env.NOVA_DATA_DATABASE_URL ||
      process.env.SUPABASE_DB_URL ||
      process.env.DATABASE_URL,
  );
  if (!databaseUrl) return '';
  try {
    const parsed = new URL(databaseUrl);
    const username = decodeURIComponent(parsed.username || '');
    const userMatch = username.match(/^postgres\.([a-z0-9]+)/i);
    if (userMatch?.[1]) return userMatch[1];
  } catch {
    return '';
  }
  return '';
}

export function resolveSupabaseAuthUrl() {
  const configured = trim(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  if (configured) return configured;
  const projectRef = resolveSupabaseProjectRefFromDatabaseUrl();
  return projectRef ? `https://${projectRef}.supabase.co` : '';
}

export function resolveSupabaseAnonKey() {
  return trim(
    process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY,
  );
}

export function hasSupabaseAuthProvider() {
  return Boolean(resolveSupabaseAuthUrl() && resolveSupabaseAnonKey());
}

export function resolveSupabaseAuthRedirectUrl() {
  const configured = trim(
    process.env.SUPABASE_AUTH_REDIRECT_URL || process.env.VITE_SUPABASE_AUTH_REDIRECT_URL,
  );
  if (configured) return configured;
  const appUrl = trim(process.env.NOVA_APP_URL);
  if (appUrl) return appUrl;
  if (process.env.NODE_ENV !== 'production') {
    return 'http://127.0.0.1:5173/';
  }
  return '';
}

export function readSupabaseBrowserRuntimeConfig() {
  return {
    provider: 'supabase' as const,
    configured: hasSupabaseAuthProvider(),
    url: resolveSupabaseAuthUrl() || null,
    anonKey: resolveSupabaseAnonKey() || null,
    redirectUrl: resolveSupabaseAuthRedirectUrl() || null,
  };
}

export function getSupabaseAuthClient() {
  if (!hasSupabaseAuthProvider()) {
    throw new Error('SUPABASE_AUTH_NOT_CONFIGURED');
  }
  if (supabaseAuthClientSingleton) return supabaseAuthClientSingleton;
  supabaseAuthClientSingleton = createClient(resolveSupabaseAuthUrl(), resolveSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  return supabaseAuthClientSingleton;
}

export type VerifiedSupabaseAuthUser = SupabaseUser;

export function isSupabaseEmailConfirmed(user: SupabaseUser | null | undefined) {
  if (!user) return false;
  return Boolean(
    (user as SupabaseUser & { email_confirmed_at?: string | null; confirmed_at?: string | null })
      .email_confirmed_at || (user as SupabaseUser & { confirmed_at?: string | null }).confirmed_at,
  );
}

export async function verifySupabaseAccessToken(
  accessToken: string | null | undefined,
): Promise<VerifiedSupabaseAuthUser | null> {
  const normalized = trim(accessToken);
  if (!normalized) return null;
  const client = getSupabaseAuthClient();
  const { data, error } = await client.auth.getUser(normalized);
  if (error || !data.user || !isSupabaseEmailConfirmed(data.user)) return null;
  return data.user;
}

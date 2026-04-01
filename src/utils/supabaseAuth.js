import { createClient } from '@supabase/supabase-js';
import {
  trim,
  readDefinedGlobal,
  trimTrailingSlash,
  runtimeApiBases,
  buildApiUrl,
} from './apiBase';

let browserClient = null;
let browserClientKey = '';
let runtimeConfig = null;
let runtimeConfigPromise = null;

function readStaticSupabaseBrowserConfig() {
  const url = trim(
    import.meta.env?.VITE_SUPABASE_URL || readDefinedGlobal('__NOVA_PUBLIC_SUPABASE_URL__'),
  );
  const anonKey = trim(
    import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env?.VITE_SUPABASE_ANON_KEY ||
      readDefinedGlobal('__NOVA_PUBLIC_SUPABASE_PUBLISHABLE_KEY__'),
  );
  if (!url || !anonKey) return null;
  return {
    url,
    anonKey,
    redirectUrl:
      trim(
        import.meta.env?.VITE_SUPABASE_AUTH_REDIRECT_URL ||
          readDefinedGlobal('__NOVA_PUBLIC_SUPABASE_REDIRECT_URL__'),
      ) || null,
  };
}

async function fetchRuntimeSupabaseBrowserConfig() {
  const candidates = runtimeApiBases();
  let lastError = null;

  for (const base of candidates) {
    try {
      const response = await fetch(buildApiUrl('/api/auth/provider-config', base), {
        credentials: 'omit',
        mode: base ? 'cors' : undefined,
        cache: 'no-store',
      });
      if (!response.ok) continue;
      const payload = await response.json().catch(() => null);
      if (!payload?.configured || !payload?.url || !payload?.anonKey) {
        continue;
      }
      return {
        url: trim(payload.url),
        anonKey: trim(payload.anonKey),
        redirectUrl: trim(payload.redirectUrl) || null,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  if (lastError) {
    return null;
  }
  return null;
}

const SESSION_STORAGE_KEY = 'novaquant-supabase-browser-config';

function readCachedRuntimeConfig() {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.url && parsed?.anonKey) return parsed;
  } catch {
    // sessionStorage may be blocked (e.g. incognito Safari)
  }
  return null;
}

function writeCachedRuntimeConfig(config) {
  try {
    if (typeof sessionStorage === 'undefined' || !config) return;
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Best-effort — ignore quota or access errors.
  }
}

export async function loadSupabaseBrowserConfig() {
  const staticConfig = readStaticSupabaseBrowserConfig();
  if (staticConfig) {
    runtimeConfig = staticConfig;
    return runtimeConfig;
  }
  if (runtimeConfig) return runtimeConfig;

  // Check sessionStorage before issuing network requests.
  const cached = readCachedRuntimeConfig();
  if (cached) {
    runtimeConfig = cached;
    return runtimeConfig;
  }

  if (runtimeConfigPromise) return runtimeConfigPromise;

  runtimeConfigPromise = fetchRuntimeSupabaseBrowserConfig()
    .then((config) => {
      runtimeConfig = config;
      writeCachedRuntimeConfig(config);
      return runtimeConfig;
    })
    .finally(() => {
      runtimeConfigPromise = null;
    });

  return runtimeConfigPromise;
}

export function resolveSupabaseBrowserUrl() {
  return trim(runtimeConfig?.url || readStaticSupabaseBrowserConfig()?.url);
}

export function resolveSupabaseBrowserAnonKey() {
  return trim(runtimeConfig?.anonKey || readStaticSupabaseBrowserConfig()?.anonKey);
}

export function hasSupabaseAuthBrowserConfig() {
  return Boolean(resolveSupabaseBrowserUrl() && resolveSupabaseBrowserAnonKey());
}

export function getSupabaseBrowserClient() {
  if (!hasSupabaseAuthBrowserConfig()) return null;
  const clientKey = `${resolveSupabaseBrowserUrl()}::${resolveSupabaseBrowserAnonKey()}`;
  if (browserClient && browserClientKey === clientKey) return browserClient;
  browserClientKey = clientKey;
  browserClient = createClient(resolveSupabaseBrowserUrl(), resolveSupabaseBrowserAnonKey(), {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
  return browserClient;
}

function createIsolatedSupabaseBrowserClient() {
  if (!hasSupabaseAuthBrowserConfig()) return null;
  return createClient(resolveSupabaseBrowserUrl(), resolveSupabaseBrowserAnonKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      storageKey: `novaquant-signup-isolated-${Date.now()}`,
    },
  });
}

export async function ensureSupabaseBrowserClient() {
  if (!hasSupabaseAuthBrowserConfig()) {
    await loadSupabaseBrowserConfig();
  }
  return getSupabaseBrowserClient();
}

export async function signUpWithSupabaseEmailVerification({ email, password, options } = {}) {
  await loadSupabaseBrowserConfig();
  const client = createIsolatedSupabaseBrowserClient();
  if (!client) {
    throw new Error('SUPABASE_AUTH_NOT_CONFIGURED');
  }
  return client.auth.signUp({
    email,
    password,
    options,
  });
}

export async function resendSupabaseSignupVerification({ email, emailRedirectTo } = {}) {
  await loadSupabaseBrowserConfig();
  const client = createIsolatedSupabaseBrowserClient();
  if (!client) {
    throw new Error('SUPABASE_AUTH_NOT_CONFIGURED');
  }
  return client.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo,
    },
  });
}

export async function getSupabaseAccessToken() {
  const client = await ensureSupabaseBrowserClient();
  if (!client) return null;
  const {
    data: { session },
  } = await client.auth.getSession();
  return session?.access_token || null;
}

export function getSupabaseAuthRedirectUrl() {
  const configured = trim(
    runtimeConfig?.redirectUrl || readStaticSupabaseBrowserConfig()?.redirectUrl,
  );
  if (configured) return configured;
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/`;
}

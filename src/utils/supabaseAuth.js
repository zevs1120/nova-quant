import { createClient } from '@supabase/supabase-js';

let browserClient = null;
let browserClientKey = '';
let runtimeConfig = null;
let runtimeConfigPromise = null;

function trim(value) {
  return String(value || '').trim();
}

function trimTrailingSlash(value) {
  return trim(value).replace(/\/+$/, '');
}

function unique(values) {
  const seen = new Set();
  const next = [];
  values.forEach((value) => {
    if (value === null || value === undefined) return;
    const normalized = String(value);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    next.push(normalized);
  });
  return next;
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function runtimeApiBases() {
  const envBases = unique([
    trimTrailingSlash(import.meta.env?.VITE_API_BASE_URL),
    trimTrailingSlash(import.meta.env?.VITE_PUBLIC_API_BASE_URL),
  ]);

  if (typeof window === 'undefined') return envBases;

  const hostname = String(window.location?.hostname || '');
  const protocol = String(window.location?.protocol || 'https:');
  if (protocol === 'file:' || isLocalHost(hostname)) {
    return unique([...envBases, 'http://127.0.0.1:8787', 'http://localhost:8787', '']);
  }

  if (hostname === 'api.novaquant.cloud') {
    return unique([...envBases, '']);
  }

  if (
    hostname === 'novaquant.cloud' ||
    hostname === 'app.novaquant.cloud' ||
    hostname === 'admin.novaquant.cloud' ||
    hostname.endsWith('.novaquant.cloud')
  ) {
    return unique([...envBases, 'https://api.novaquant.cloud', '']);
  }

  return unique([...envBases, 'https://api.novaquant.cloud']);
}

function buildApiUrl(path, base = '') {
  const normalizedPath = String(path || '').startsWith('/')
    ? String(path)
    : `/${String(path || '')}`;
  if (!base) return normalizedPath;
  return `${trimTrailingSlash(base)}${normalizedPath}`;
}

function readStaticSupabaseBrowserConfig() {
  const url = trim(import.meta.env?.VITE_SUPABASE_URL);
  const anonKey = trim(
    import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY,
  );
  if (!url || !anonKey) return null;
  return {
    url,
    anonKey,
    redirectUrl: trim(import.meta.env?.VITE_SUPABASE_AUTH_REDIRECT_URL) || null,
  };
}

async function fetchRuntimeSupabaseBrowserConfig() {
  const candidates = runtimeApiBases();
  let lastError = null;

  for (const base of candidates) {
    try {
      const response = await fetch(buildApiUrl('/api/auth/provider-config', base), {
        credentials: 'include',
        mode: base ? 'cors' : undefined,
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

export async function loadSupabaseBrowserConfig() {
  const staticConfig = readStaticSupabaseBrowserConfig();
  if (staticConfig) {
    runtimeConfig = staticConfig;
    return runtimeConfig;
  }
  if (runtimeConfig) return runtimeConfig;
  if (runtimeConfigPromise) return runtimeConfigPromise;

  runtimeConfigPromise = fetchRuntimeSupabaseBrowserConfig()
    .then((config) => {
      runtimeConfig = config;
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

export async function ensureSupabaseBrowserClient() {
  if (!hasSupabaseAuthBrowserConfig()) {
    await loadSupabaseBrowserConfig();
  }
  return getSupabaseBrowserClient();
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

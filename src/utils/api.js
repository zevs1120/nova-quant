import { getSupabaseAccessToken } from './supabaseAuth';
import { runtimeApiBases, buildApiUrl, trimTrailingSlash, unique, isLocalHost } from './apiBase';

let cachedApiBase = null;

function resolveApiUrl(path) {
  return buildApiUrl(path, cachedApiBase ?? runtimeApiBases()[0] ?? '');
}

function shouldRetryWithNextBase(path, base, response) {
  if (!String(path || '').startsWith('/api/')) return false;
  if (typeof window === 'undefined') return false;
  if (!isLocalHost(String(window.location?.hostname || ''))) return false;

  const contentType = String(response?.headers?.get?.('content-type') || '').toLowerCase();
  return response?.status === 404 || response?.status === 405 || contentType.includes('text/html');
}

async function withAuthHeaders(options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Authorization')) {
    try {
      const accessToken = await getSupabaseAccessToken();
      if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
      }
    } catch {
      // Best-effort: unauthenticated calls should still proceed.
    }
  }
  return {
    ...options,
    headers,
  };
}

export async function fetchApi(path, options = {}) {
  const requestOptions = await withAuthHeaders(options);
  // Fast path: use cached base without computing fallback candidates
  if (cachedApiBase !== null) {
    const url = buildApiUrl(path, cachedApiBase);
    try {
      const response = await fetch(url, {
        ...requestOptions,
        mode: cachedApiBase ? 'cors' : options.mode,
        credentials: options.credentials ?? 'include',
      });
      if (shouldRetryWithNextBase(path, cachedApiBase, response)) {
        cachedApiBase = null;
      } else {
        return response;
      }
    } catch {
      // Cached base failed — fall through to full candidate list
      cachedApiBase = null;
    }
  }

  const candidates = unique(runtimeApiBases());
  let lastError = null;
  let lastRetryableResponse = null;

  for (const base of candidates) {
    const url = buildApiUrl(path, base);
    try {
      const response = await fetch(url, {
        ...requestOptions,
        mode: base ? 'cors' : options.mode,
        credentials: options.credentials ?? 'include',
      });
      if (shouldRetryWithNextBase(path, base, response)) {
        lastRetryableResponse = response;
        continue;
      }
      cachedApiBase = base;
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  if (lastError) throw lastError;
  if (lastRetryableResponse) return lastRetryableResponse;
  throw new Error(`Unable to reach API for ${path}`);
}

export async function fetchApiJson(path, options = {}) {
  const response = await fetchApi(path, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `${resolveApiUrl(path)} failed (${response.status})`);
  }
  return response.json();
}

import { getSupabaseAccessToken } from './supabaseAuth';
import { runtimeApiBases, buildApiUrl, unique } from '../shared/http/apiBase.js';
import { shouldRetryWithNextBase } from '../shared/http/apiRetry.js';
import {
  finalizeGovernedRequest,
  governanceBucket,
  makeDedupeKey,
  runCoalescedFetch,
  shouldCoalesceRequest,
  syntheticIfBucketBackoff,
  syntheticIfGlobalPaused,
  waitRequestSpacing,
} from '../shared/http/apiGovernance.js';

let cachedApiBase = null;

function resolveApiUrl(path) {
  return buildApiUrl(path, cachedApiBase ?? runtimeApiBases()[0] ?? '');
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

/**
 * Core fetch without governance (fallback chain + base cache).
 * @param {string} path
 * @param {RequestInit} requestOptions
 * @param {RequestInit} originalOptions
 */
async function executeFetchApi(path, requestOptions, originalOptions) {
  if (cachedApiBase !== null) {
    const url = buildApiUrl(path, cachedApiBase);
    try {
      const response = await fetch(url, {
        ...requestOptions,
        mode: cachedApiBase ? 'cors' : originalOptions.mode,
        credentials: originalOptions.credentials ?? 'include',
      });
      if (shouldRetryWithNextBase(path, response)) {
        cachedApiBase = null;
      } else {
        return response;
      }
    } catch {
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
        mode: base ? 'cors' : originalOptions.mode,
        credentials: originalOptions.credentials ?? 'include',
      });
      if (shouldRetryWithNextBase(path, response)) {
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

export async function fetchApi(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const body = options.body;

  const paused = syntheticIfGlobalPaused();
  if (paused) return paused;

  const bucket = governanceBucket(path, method);
  const backoff = syntheticIfBucketBackoff(bucket);
  if (backoff) return backoff;

  const runRequest = async () => {
    await waitRequestSpacing(bucket);
    const requestOptions = await withAuthHeaders(options);
    try {
      const response = await executeFetchApi(path, requestOptions, options);
      finalizeGovernedRequest(bucket, response, null);
      return response;
    } catch (error) {
      finalizeGovernedRequest(bucket, null, error);
      throw error;
    }
  };

  if (!shouldCoalesceRequest(path, method)) {
    return runRequest();
  }

  const dedupeKey = makeDedupeKey(method, path, body);
  return runCoalescedFetch(dedupeKey, runRequest);
}

export async function fetchApiJson(path, options = {}) {
  const response = await fetchApi(path, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `${resolveApiUrl(path)} failed (${response.status})`);
  }
  return response.json();
}

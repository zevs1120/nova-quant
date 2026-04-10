import { buildApiUrl, runtimeApiBases, unique } from './apiBase.js';
import { shouldRetryWithNextBase } from './apiRetry.js';

function mergeAbortSignals(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any([a, b]);
  }
  const merged = new AbortController();
  const forward = () => merged.abort();
  if (a.aborted || b.aborted) {
    merged.abort();
    return merged.signal;
  }
  a.addEventListener('abort', forward, { once: true });
  b.addEventListener('abort', forward, { once: true });
  return merged.signal;
}

/**
 * Try each configured API base in order (admin / multi-base dev).
 *
 * @param {string} path
 * @param {RequestInit} [init]
 * @param {{
 *   credentials?: RequestCredentials;
 *   timeoutMs?: number | null;
 *   useLocalhostBaseRetry?: boolean;
 * }} [options]
 * @returns {Promise<Response>}
 */
export async function fetchAcrossApiBases(path, init = {}, options = {}) {
  const credentials = options.credentials ?? init.credentials ?? 'include';
  const timeoutMs = options.timeoutMs ?? null;
  const useLocalhostBaseRetry = options.useLocalhostBaseRetry !== false;

  const candidates = unique(runtimeApiBases());
  let lastError = null;
  let lastRetryableResponse = null;

  for (const base of candidates) {
    const url = buildApiUrl(path, base);
    const controller = timeoutMs ? new AbortController() : null;
    const timer =
      controller && timeoutMs
        ? setTimeout(() => {
            controller.abort();
          }, timeoutMs)
        : null;
    try {
      const response = await fetch(url, {
        ...init,
        credentials,
        mode: base ? 'cors' : init.mode,
        signal: mergeAbortSignals(init.signal, controller?.signal),
      });
      if (timer) clearTimeout(timer);
      if (useLocalhostBaseRetry && shouldRetryWithNextBase(path, response)) {
        lastRetryableResponse = response;
        continue;
      }
      return response;
    } catch (error) {
      if (timer) clearTimeout(timer);
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  if (lastError) throw lastError;
  if (lastRetryableResponse) return lastRetryableResponse;
  throw new Error(`Unable to reach API for ${path}`);
}

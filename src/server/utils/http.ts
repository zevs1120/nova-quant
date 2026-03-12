import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import fs from 'node:fs';
import { sleep } from './time.js';

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retry: { attempts: number; baseDelayMs: number },
  timeoutMs = 30_000
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retry.attempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(`Timeout after ${timeoutMs}ms`), timeoutMs);
      let response: Response;
      try {
        response = await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (response.ok) return response;

      if (response.status >= 500 || response.status === 429) {
        throw new Error(`HTTP ${response.status} on ${url}`);
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt === retry.attempts) break;
      await sleep(retry.baseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unknown network error');
}

export async function downloadToFile(
  url: string,
  filePath: string,
  retry: { attempts: number; baseDelayMs: number },
  timeoutMs = 30_000
): Promise<void> {
  const res = await fetchWithRetry(url, {}, retry, timeoutMs);
  if (!res.ok || !res.body) {
    throw new Error(`Failed download ${url}: ${res.status}`);
  }

  await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(filePath));
}

import { isLocalHost } from './apiBase.js';

export function shouldRetryWithNextBase(path, response) {
  if (!String(path || '').startsWith('/api/')) return false;
  if (typeof window === 'undefined') return false;
  if (!isLocalHost(String(window.location?.hostname || ''))) return false;

  const contentType = String(response?.headers?.get?.('content-type') || '').toLowerCase();
  return response?.status === 404 || response?.status === 405 || contentType.includes('text/html');
}

import { fetchApiJson } from './api';

const detailCache = new Map();
const inflightRequests = new Map();

function cacheKey(signalId, userId) {
  return `${String(userId || 'guest-default')}::${String(signalId || '')}`;
}

export function hasSignalDetailPayload(signal) {
  return Boolean(signal?.payload?.kind);
}

export function mergeSignalDetail(summary, detail) {
  if (!detail) return summary;
  return {
    ...(summary || {}),
    ...detail,
    id: detail.id || summary?.id || summary?.signal_id || null,
    signal_id: detail.signal_id || detail.id || summary?.signal_id || summary?.id || null,
  };
}

export async function fetchSignalDetail(signalId, { userId } = {}) {
  const normalizedSignalId = String(signalId || '').trim();
  if (!normalizedSignalId) return null;

  const key = cacheKey(normalizedSignalId, userId);
  if (detailCache.has(key)) {
    return detailCache.get(key);
  }
  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const query = new URLSearchParams();
  if (userId) query.set('userId', userId);
  const path = `/api/signals/${encodeURIComponent(normalizedSignalId)}${
    query.toString() ? `?${query.toString()}` : ''
  }`;
  const request = fetchApiJson(path, { cache: 'no-store' })
    .then((payload) => {
      const detail = payload?.data || null;
      if (detail) {
        detailCache.set(key, detail);
      }
      return detail;
    })
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, request);
  return request;
}

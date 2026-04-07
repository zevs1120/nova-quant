import { useEffect, useState } from 'react';

const RECENT_OUTCOME_CACHE_TTL_MS = 60_000;
const RECENT_OUTCOME_STORAGE_TTL_MS = 300_000;
const RECENT_OUTCOME_STORAGE_KEY_PREFIX = 'nq:recent-outcomes:';

const recentOutcomeCache = new Map();
const recentOutcomeInflight = new Map();

function nowMs() {
  return Date.now();
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeOutcomeUserId(userId) {
  return String(userId || 'guest-default').trim() || 'guest-default';
}

function buildOutcomeCacheKey(userId, limit) {
  return `${normalizeOutcomeUserId(userId)}:${Number(limit || 50)}`;
}

function buildOutcomeStorageKey(cacheKey) {
  return `${RECENT_OUTCOME_STORAGE_KEY_PREFIX}${cacheKey}`;
}

function readCachedOutcomeData(cacheKey) {
  const cached = recentOutcomeCache.get(cacheKey);
  if (cached && cached.expiresAt > nowMs()) {
    return cached.value;
  }
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(buildOutcomeStorageKey(cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    if (parsed.savedAt + RECENT_OUTCOME_STORAGE_TTL_MS < nowMs()) {
      window.localStorage.removeItem(buildOutcomeStorageKey(cacheKey));
      return null;
    }
    recentOutcomeCache.set(cacheKey, {
      expiresAt: parsed.savedAt + RECENT_OUTCOME_CACHE_TTL_MS,
      value: parsed.value || { outcomes: [], stats: null },
    });
    return parsed.value || { outcomes: [], stats: null };
  } catch {
    return null;
  }
}

function storeCachedOutcomeData(cacheKey, value) {
  const entry = {
    expiresAt: nowMs() + RECENT_OUTCOME_CACHE_TTL_MS,
    value: value || { outcomes: [], stats: null },
  };
  recentOutcomeCache.set(cacheKey, entry);
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(
      buildOutcomeStorageKey(cacheKey),
      JSON.stringify({
        savedAt: nowMs(),
        value: entry.value,
      }),
    );
  } catch {
    // ignore storage failures
  }
}

async function loadRecentOutcomeData({ cacheKey, effectiveUserId, limit, fetchJson }) {
  const cached = readCachedOutcomeData(cacheKey);
  if (cached) return cached;
  if (recentOutcomeInflight.has(cacheKey)) {
    return recentOutcomeInflight.get(cacheKey);
  }
  const query = effectiveUserId
    ? `?userId=${encodeURIComponent(effectiveUserId)}&limit=${limit}`
    : `?limit=${limit}`;
  const request = fetchJson(`/api/outcomes/recent${query}`)
    .then((data) => {
      const payload = {
        outcomes: Array.isArray(data?.outcomes) ? data.outcomes : [],
        stats: data?.stats || null,
      };
      storeCachedOutcomeData(cacheKey, payload);
      return payload;
    })
    .finally(() => {
      recentOutcomeInflight.delete(cacheKey);
    });
  recentOutcomeInflight.set(cacheKey, request);
  return request;
}

export function __resetRecentOutcomeCacheForTesting() {
  recentOutcomeCache.clear();
  recentOutcomeInflight.clear();
  if (!canUseStorage()) return;
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith(RECENT_OUTCOME_STORAGE_KEY_PREFIX))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore storage failures
  }
}

export function useRecentOutcomes({ effectiveUserId, fetchJson, limit = 50 }) {
  const cacheKey = buildOutcomeCacheKey(effectiveUserId, limit);
  const [outcomeData, setOutcomeData] = useState(
    () => readCachedOutcomeData(cacheKey) || { outcomes: [], stats: null },
  );
  const [loading, setLoading] = useState(() => !readCachedOutcomeData(cacheKey));

  useEffect(() => {
    const cached = readCachedOutcomeData(cacheKey);
    if (cached) {
      setOutcomeData(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    loadRecentOutcomeData({
      cacheKey,
      effectiveUserId,
      limit,
      fetchJson,
    })
      .then((payload) => {
        if (!cancelled) {
          setOutcomeData(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOutcomeData((current) => current || { outcomes: [], stats: null });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, effectiveUserId, fetchJson, limit]);

  return { outcomeData, loading };
}

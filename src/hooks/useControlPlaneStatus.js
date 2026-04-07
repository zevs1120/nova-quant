import { useEffect, useState } from 'react';

const CONTROL_PLANE_CACHE_TTL_MS = 60_000;
const CONTROL_PLANE_STORAGE_TTL_MS = 300_000;
const CONTROL_PLANE_STORAGE_KEY_PREFIX = 'nq:control-plane:';

const controlPlaneCache = new Map();
const controlPlaneInflight = new Map();

function nowMs() {
  return Date.now();
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeControlPlaneScope(userId) {
  const normalized = String(userId || 'guest-default').trim() || 'guest-default';
  return normalized === 'guest-default' || normalized.startsWith('guest-')
    ? 'guest-public'
    : normalized;
}

function buildStorageKey(scope) {
  return `${CONTROL_PLANE_STORAGE_KEY_PREFIX}${scope}`;
}

function readCachedControlPlane(scope) {
  const cached = controlPlaneCache.get(scope);
  if (cached && cached.expiresAt > nowMs()) {
    return cached.value;
  }
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(buildStorageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    if (parsed.savedAt + CONTROL_PLANE_STORAGE_TTL_MS < nowMs()) {
      window.localStorage.removeItem(buildStorageKey(scope));
      return null;
    }
    controlPlaneCache.set(scope, {
      expiresAt: parsed.savedAt + CONTROL_PLANE_CACHE_TTL_MS,
      value: parsed.value || null,
    });
    return parsed.value || null;
  } catch {
    return null;
  }
}

function storeCachedControlPlane(scope, value) {
  const entry = {
    expiresAt: nowMs() + CONTROL_PLANE_CACHE_TTL_MS,
    value: value || null,
  };
  controlPlaneCache.set(scope, entry);
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(
      buildStorageKey(scope),
      JSON.stringify({
        savedAt: nowMs(),
        value: value || null,
      }),
    );
  } catch {
    // ignore storage failures
  }
}

async function loadControlPlane(scope, userId, fetchJson) {
  const cached = readCachedControlPlane(scope);
  if (cached) return cached;
  if (controlPlaneInflight.has(scope)) {
    return controlPlaneInflight.get(scope);
  }
  const request = fetchJson(`/api/control-plane/status?userId=${encodeURIComponent(userId)}`)
    .then((payload) => {
      storeCachedControlPlane(scope, payload || null);
      return payload || null;
    })
    .finally(() => {
      controlPlaneInflight.delete(scope);
    });
  controlPlaneInflight.set(scope, request);
  return request;
}

export function __resetControlPlaneStatusClientCacheForTesting() {
  controlPlaneCache.clear();
  controlPlaneInflight.clear();
  if (!canUseStorage()) return;
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith(CONTROL_PLANE_STORAGE_KEY_PREFIX))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore storage failures
  }
}

export function useControlPlaneStatus({ data, fetchJson, effectiveUserId }) {
  const hydratedControlPlane = data?.config?.runtime?.control_plane || data?.control_plane || null;
  const scope = normalizeControlPlaneScope(effectiveUserId);
  const [controlPlane, setControlPlane] = useState(
    () => hydratedControlPlane || readCachedControlPlane(scope),
  );
  const [loading, setLoading] = useState(
    () => !hydratedControlPlane && !readCachedControlPlane(scope),
  );

  useEffect(() => {
    if (hydratedControlPlane) {
      storeCachedControlPlane(scope, hydratedControlPlane);
      setControlPlane(hydratedControlPlane);
      setLoading(false);
      return;
    }

    const cached = readCachedControlPlane(scope);
    if (cached) {
      setControlPlane(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    loadControlPlane(scope, effectiveUserId || 'guest-default', fetchJson)
      .then((payload) => {
        if (!cancelled) {
          setControlPlane(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setControlPlane(null);
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
  }, [hydratedControlPlane, effectiveUserId, fetchJson, scope]);

  return {
    controlPlane: hydratedControlPlane || controlPlane,
    loading,
  };
}

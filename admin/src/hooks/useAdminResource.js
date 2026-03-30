import { useEffect, useRef, useState } from 'react';

/** Module-level cache that survives across tab switches.
 *  Maps unique cache key → { data, loading, error, fetchedAt }
 *  Entries expire after STALE_TTL_MS to prevent stale data indefinitely. */
const _tabCache = new Map();
const STALE_TTL_MS = 30_000; // 30s -- tab data considered stale after this

function cacheKey(loader, deps) {
  return `${loader.name || 'anonymous'}:${JSON.stringify(deps)}`;
}

export default function useAdminResource(loader, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const key = useRef(cacheKey(loader, deps));

  useEffect(() => {
    const cached = _tabCache.get(key.current);
    const now = Date.now();
    const isFresh = cached && !cached.loading && now - cached.fetchedAt < STALE_TTL_MS;

    // Case 1: Fresh cached data -- show immediately, no blocking loading
    if (isFresh) {
      setData(cached.data);
      setError(cached.error || '');
      setLoading(false);
      // Background refresh to keep data fresh
      loader()
        .then((payload) => {
          const result = payload?.data ?? payload ?? null;
          _tabCache.set(key.current, {
            data: result,
            loading: false,
            error: '',
            fetchedAt: Date.now(),
          });
          setData(result);
          setError('');
        })
        .catch(() => {
          // Silently fail background refresh -- do NOT update cache with error,
          // so the next tab switch still shows the good cached data.
        });
      return;
    }

    // Case 2: No fresh cache -- block on loading state
    setLoading(true);
    setError('');
    if (cached && cached.data !== null && cached.data !== undefined) {
      setData(cached.data);
      if (cached.error) setError(cached.error);
    }

    loader()
      .then((payload) => {
        const result = payload?.data ?? payload ?? null;
        setData(result);
        setError('');
        setLoading(false);
        _tabCache.set(key.current, {
          data: result,
          loading: false,
          error: '',
          fetchedAt: Date.now(),
        });
      })
      .catch((reason) => {
        const msg = String(reason?.message || 'ADMIN_DATA_LOAD_FAILED');
        const hasPriorData = cached && cached.data !== null && cached.data !== undefined;
        // Only show error in UI state when there is no prior data to fall back on.
        // With prior data the user keeps seeing the stale-but-good data; the error
        // is silently absorbed so we don't throw away a perfectly valid render.
        if (!hasPriorData) {
          setError(msg);
        }
        setLoading(false);
        _tabCache.set(key.current, {
          data: hasPriorData ? cached.data : null,
          loading: false,
          error: hasPriorData ? cached.error : msg,
          fetchedAt: cached?.fetchedAt ?? Date.now(),
        });
      });
  }, deps);

  return { data, loading, error };
}

/** Pre-warm the cache for a given loader so tab switches are instant */
export function prefetchAdminResource(loader, deps = []) {
  const key = cacheKey(loader, deps);
  const cached = _tabCache.get(key);
  if (cached?.loading) return;
  if (cached && Date.now() - cached.fetchedAt < STALE_TTL_MS) return;
  loader()
    .then((payload) => {
      const result = payload?.data ?? payload ?? null;
      _tabCache.set(key, { data: result, loading: false, error: '', fetchedAt: Date.now() });
    })
    .catch(() => {});
}

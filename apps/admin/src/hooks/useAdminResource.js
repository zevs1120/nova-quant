import { useEffect, useState } from 'react';

export default function useAdminResource(loader, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    loader()
      .then((payload) => {
        if (cancelled) return;
        setData(payload?.data ?? payload ?? null);
      })
      .catch((reason) => {
        if (cancelled) return;
        setError(String(reason?.message || 'ADMIN_DATA_LOAD_FAILED'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, deps);

  return { data, loading, error };
}

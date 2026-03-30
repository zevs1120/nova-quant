import { useEffect, useState } from 'react';

export function useControlPlaneStatus({ data, fetchJson, effectiveUserId }) {
  const hydratedControlPlane = data?.config?.runtime?.control_plane || data?.control_plane || null;
  const [controlPlane, setControlPlane] = useState(() => hydratedControlPlane);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hydratedControlPlane) {
      setControlPlane(hydratedControlPlane);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchJson(`/api/control-plane/status?userId=${effectiveUserId}`)
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
  }, [hydratedControlPlane, effectiveUserId, fetchJson]);

  return {
    controlPlane: hydratedControlPlane || controlPlane,
    loading,
  };
}

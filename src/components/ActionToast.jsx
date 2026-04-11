import { memo } from 'react';

function ActionToast({ toast }) {
  if (!toast?.message) return null;

  return (
    <div className="action-toast-shell" aria-live="polite" aria-atomic="true">
      <div className={`action-toast action-toast-${toast.tone || 'neutral'}`} role="status">
        <p className="action-toast-message">{toast.message}</p>
      </div>
    </div>
  );
}

export default memo(ActionToast);

function modeLabel(profileKey, t) {
  if (profileKey === 'conservative') return t('onboarding.profile.conservative');
  if (profileKey === 'aggressive') return t('onboarding.profile.aggressive');
  return t('onboarding.profile.balanced');
}

function uiModeLabel(uiMode, t) {
  if (uiMode === 'beginner') return t('mode.beginner', undefined, 'Beginner');
  if (uiMode === 'advanced') return t('mode.advanced', undefined, 'Advanced');
  return t('mode.standard', undefined, 'Standard');
}

export default function SystemStatusBar({
  connected,
  riskMode,
  uiMode,
  currency = 'USD',
  t,
  locale
}) {
  const dataLabel = connected ? t('app.dataConnected', undefined, 'Data: Ready') : t('app.dataDelayed', undefined, 'Data: Delayed');
  return (
    <div className="system-status-bar">
      <span className={`status-chip ${connected ? 'status-chip-ok' : 'status-chip-warn'}`}>{dataLabel}</span>
      <span className="status-chip">{t('app.riskMode', undefined, 'Risk Mode')}: {modeLabel(riskMode, t)}</span>
      <span className="status-chip">{t('app.userMode', undefined, 'Mode')}: {uiModeLabel(uiMode, t)}</span>
      <span className="status-chip">{t('app.currency', undefined, 'Currency')}: {currency}</span>
    </div>
  );
}

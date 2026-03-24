import SegmentedControl from './SegmentedControl';

export default function SettingsTab({
  engagementState,
  uiMode,
  setUiMode,
  riskProfileKey,
  setRiskProfileKey,
  lang,
  setLang,
  t,
  isDemoRuntime,
  effectiveUserId,
  setShowOnboarding,
  setAboutOpen,
  loadEngagementState,
  setEngagementState,
  fetchJson,
}) {
  const notificationPrefs = engagementState?.notification_preferences;

  const togglePreference = async (field, nextValue) => {
    if (isDemoRuntime) return;
    try {
      const payload = await fetchJson('/api/notification-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveUserId,
          [field]: nextValue,
        }),
      });
      setEngagementState((current) =>
        current
          ? {
              ...current,
              notification_preferences: payload,
            }
          : current,
      );
      void loadEngagementState();
    } catch {
      void loadEngagementState();
    }
  };

  return (
    <section className="stack-gap">
      <article className="glass-card">
        <h3 className="card-title">Preferences</h3>
        <p className="muted status-line">模式会改变信息密度，不会改变底层策略产出。</p>

        <div style={{ marginTop: 10 }}>
          <SegmentedControl
            label={t('app.userMode', undefined, 'Mode')}
            options={[
              { label: t('mode.beginner', undefined, 'Beginner'), value: 'beginner' },
              { label: t('mode.standard', undefined, 'Standard'), value: 'standard' },
              { label: t('mode.advanced', undefined, 'Advanced'), value: 'advanced' },
            ]}
            value={uiMode}
            onChange={setUiMode}
            compact
          />
        </div>

        <div style={{ marginTop: 10 }}>
          <SegmentedControl
            label={t('app.riskMode', undefined, 'Risk Mode')}
            options={[
              { label: t('onboarding.profile.conservative'), value: 'conservative' },
              { label: t('onboarding.profile.balanced'), value: 'balanced' },
              { label: t('onboarding.profile.aggressive'), value: 'aggressive' },
            ]}
            value={riskProfileKey}
            onChange={setRiskProfileKey}
            compact
          />
        </div>

        <div
          style={{ marginTop: 10 }}
          className="lang-toggle"
          role="group"
          aria-label="Language switch"
        >
          <button
            type="button"
            className={`lang-option ${lang === 'en' ? 'active' : ''}`}
            onClick={() => setLang('en')}
          >
            EN
          </button>
          <button
            type="button"
            className={`lang-option ${lang === 'zh' ? 'active' : ''}`}
            onClick={() => setLang('zh')}
          >
            中文
          </button>
        </div>

        <div className="action-row" style={{ marginTop: 10 }}>
          <button type="button" className="secondary-btn" onClick={() => setShowOnboarding(true)}>
            Re-run Onboarding
          </button>
          <button type="button" className="secondary-btn" onClick={() => setAboutOpen(true)}>
            About & Compliance
          </button>
        </div>
      </article>

      <article className="glass-card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Recall Style</h3>
            <p className="muted status-line">
              Nova only nudges when today&apos;s judgment, protection, or wrap-up is worth
              confirming.
            </p>
          </div>
          <span className="badge badge-neutral">{notificationPrefs?.frequency || 'NORMAL'}</span>
        </div>

        <div className="status-grid-2" style={{ marginTop: 10 }}>
          {[
            ['morning_enabled', 'Morning check'],
            ['state_shift_enabled', 'Judgment shifts'],
            ['protective_enabled', 'Protective reminders'],
            ['wrap_up_enabled', 'Evening wrap-up'],
          ].map(([field, label]) => {
            const enabled = Boolean(notificationPrefs?.[field]);
            return (
              <button
                key={field}
                type="button"
                className={`status-box preference-toggle ${enabled ? 'is-on' : 'is-off'}`}
                onClick={() => togglePreference(field, enabled ? 0 : 1)}
              >
                <p className="muted">{label}</p>
                <h2>{enabled ? 'On' : 'Off'}</h2>
              </button>
            );
          })}
        </div>

        <div className="action-row" style={{ marginTop: 10 }}>
          <button
            type="button"
            className={`secondary-btn ${notificationPrefs?.frequency === 'LOW' ? 'is-selected' : ''}`}
            onClick={() => togglePreference('frequency', 'LOW')}
          >
            Quiet cadence
          </button>
          <button
            type="button"
            className={`secondary-btn ${notificationPrefs?.frequency !== 'LOW' ? 'is-selected' : ''}`}
            onClick={() => togglePreference('frequency', 'NORMAL')}
          >
            Normal cadence
          </button>
        </div>
      </article>
    </section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import SegmentedControl from './SegmentedControl';

function buildCopy(locale) {
  const zh = String(locale || '').startsWith('zh');
  return {
    preferences: zh ? '偏好设置' : 'Preferences',
    preferencesBody: zh
      ? '模式会改变信息密度，语言和风险节奏会立刻保存在这台设备上。'
      : 'Mode, language, and risk pacing save right away on this device.',
    recall: zh ? '提醒节奏' : 'Recall Style',
    recallBody: zh
      ? 'Nova 只会在值得确认判断、保护或收尾的时候提醒你。'
      : "Nova only nudges when today's judgment, protection, or wrap-up is worth confirming.",
    languageSwitch: zh ? '语言切换' : 'Language switch',
    rerunOnboarding: zh ? '重新引导' : 'Re-run onboarding',
    about: zh ? '关于与合规' : 'About & compliance',
    savedLocal: zh ? '已保存在本机' : 'Saved on this device',
    savedRemote: zh ? '已保存' : 'Saved',
    saving: zh ? '保存中…' : 'Saving…',
    modeSaved: zh ? '显示模式已更新。' : 'Display mode updated.',
    riskSaved: zh ? '风险节奏已更新。' : 'Risk pace updated.',
    languageSaved: zh ? '语言已切换。' : 'Language updated.',
    notificationsSaved: zh ? '提醒偏好已保存。' : 'Notification preference saved.',
    notificationsError: zh
      ? '提醒偏好保存失败，请重试。'
      : 'Notification preference failed to save.',
    frequencyLow: zh ? '更安静' : 'Quiet cadence',
    frequencyNormal: zh ? '正常节奏' : 'Normal cadence',
    on: zh ? '开启' : 'On',
    off: zh ? '关闭' : 'Off',
    notificationLabels: [
      ['morning_enabled', zh ? '晨间检查' : 'Morning check'],
      ['state_shift_enabled', zh ? '判断变化' : 'Judgment shifts'],
      ['protective_enabled', zh ? '保护提醒' : 'Protective reminders'],
      ['wrap_up_enabled', zh ? '收尾提醒' : 'Evening wrap-up'],
    ],
  };
}

function statusToneClass(tone) {
  if (tone === 'loading') return 'badge-medium';
  if (tone === 'danger') return 'badge-expired';
  if (tone === 'success') return 'badge-triggered';
  return 'badge-neutral';
}

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
  onActionFeedback,
}) {
  const notificationPrefs = engagementState?.notification_preferences;
  const copy = useMemo(() => buildCopy(lang), [lang]);
  const [preferenceStatus, setPreferenceStatus] = useState({
    tone: 'neutral',
    message: copy.savedLocal,
  });
  const [notificationStatus, setNotificationStatus] = useState({
    tone: 'neutral',
    message: copy.savedRemote,
  });
  const [savingPreferenceKey, setSavingPreferenceKey] = useState('');

  useEffect(() => {
    setPreferenceStatus((current) =>
      current.tone === 'loading' ? current : { ...current, message: copy.savedLocal },
    );
    setNotificationStatus((current) =>
      current.tone === 'loading' ? current : { ...current, message: copy.savedRemote },
    );
  }, [copy.savedLocal, copy.savedRemote]);

  const markLocalSave = (message) => {
    setPreferenceStatus({
      tone: 'loading',
      message: copy.saving,
    });
    window.setTimeout(() => {
      setPreferenceStatus({
        tone: 'success',
        message,
      });
    }, 120);
    onActionFeedback?.({ message, tone: 'success', haptic: 'soft' });
  };

  const togglePreference = async (field, nextValue) => {
    if (isDemoRuntime) return;
    const previousPrefs = notificationPrefs || null;
    setSavingPreferenceKey(field);
    setNotificationStatus({
      tone: 'loading',
      message: copy.saving,
    });
    setEngagementState((current) =>
      current
        ? {
            ...current,
            notification_preferences: {
              ...(current.notification_preferences || {}),
              [field]: nextValue,
            },
          }
        : current,
    );
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
      setNotificationStatus({
        tone: 'success',
        message: copy.notificationsSaved,
      });
      onActionFeedback?.({ message: copy.notificationsSaved, tone: 'success' });
      void loadEngagementState();
    } catch {
      setEngagementState((current) =>
        current
          ? {
              ...current,
              notification_preferences: previousPrefs,
            }
          : current,
      );
      setNotificationStatus({
        tone: 'danger',
        message: copy.notificationsError,
      });
      onActionFeedback?.({ message: copy.notificationsError, tone: 'danger', haptic: 'soft' });
      void loadEngagementState();
    } finally {
      setSavingPreferenceKey('');
    }
  };

  return (
    <section className="stack-gap">
      <article className="glass-card">
        <div className="card-header">
          <div>
            <h3 className="card-title">{copy.preferences}</h3>
            <p className="muted status-line">{copy.preferencesBody}</p>
          </div>
          <span className={`badge ${statusToneClass(preferenceStatus.tone)}`}>
            {preferenceStatus.tone === 'loading' ? copy.saving : preferenceStatus.message}
          </span>
        </div>

        <div style={{ marginTop: 10 }}>
          <SegmentedControl
            label={t('app.userMode', undefined, 'Mode')}
            options={[
              { label: t('mode.beginner', undefined, 'Beginner'), value: 'beginner' },
              { label: t('mode.standard', undefined, 'Standard'), value: 'standard' },
              { label: t('mode.advanced', undefined, 'Advanced'), value: 'advanced' },
            ]}
            value={uiMode}
            onChange={(value) => {
              setUiMode(value);
              markLocalSave(copy.modeSaved);
            }}
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
            onChange={(value) => {
              setRiskProfileKey(value);
              markLocalSave(copy.riskSaved);
            }}
            compact
          />
        </div>

        <div
          style={{ marginTop: 10 }}
          className="lang-toggle"
          role="group"
          aria-label={copy.languageSwitch}
        >
          <button
            type="button"
            className={`lang-option ${lang === 'en' ? 'active' : ''}`}
            onClick={() => {
              setLang('en');
              markLocalSave(copy.languageSaved);
            }}
          >
            EN
          </button>
          <button
            type="button"
            className={`lang-option ${lang === 'zh' ? 'active' : ''}`}
            onClick={() => {
              setLang('zh');
              markLocalSave(copy.languageSaved);
            }}
          >
            中文
          </button>
        </div>

        <div className="action-row" style={{ marginTop: 10 }}>
          <button type="button" className="secondary-btn" onClick={() => setShowOnboarding(true)}>
            {copy.rerunOnboarding}
          </button>
          <button type="button" className="secondary-btn" onClick={() => setAboutOpen(true)}>
            {copy.about}
          </button>
        </div>
      </article>

      <article className="glass-card">
        <div className="card-header">
          <div>
            <h3 className="card-title">{copy.recall}</h3>
            <p className="muted status-line">{copy.recallBody}</p>
          </div>
          <span className={`badge ${statusToneClass(notificationStatus.tone)}`}>
            {notificationStatus.tone === 'loading'
              ? copy.saving
              : notificationStatus.message || notificationPrefs?.frequency || 'NORMAL'}
          </span>
        </div>

        <div className="status-grid-2" style={{ marginTop: 10 }}>
          {copy.notificationLabels.map(([field, label]) => {
            const enabled = Boolean(notificationPrefs?.[field]);
            return (
              <button
                key={field}
                type="button"
                className={`status-box preference-toggle ${enabled ? 'is-on' : 'is-off'}`}
                disabled={savingPreferenceKey === field}
                onClick={() => togglePreference(field, enabled ? 0 : 1)}
              >
                <p className="muted">{label}</p>
                <h2>{enabled ? copy.on : copy.off}</h2>
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
            {copy.frequencyLow}
          </button>
          <button
            type="button"
            className={`secondary-btn ${notificationPrefs?.frequency !== 'LOW' ? 'is-selected' : ''}`}
            onClick={() => togglePreference('frequency', 'NORMAL')}
          >
            {copy.frequencyNormal}
          </button>
        </div>
      </article>
    </section>
  );
}

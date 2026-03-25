import { useCallback, useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { normalizeEmail, classifyAuthError, isLocalAuthRuntime } from '../utils/appHelpers';
import { DEFAULT_AUTH_WATCHLIST } from '../config/appConstants';

/**
 * Handles authentication session lifecycle: login, signup, session hydration,
 * and logout. Profile sync to the server is managed by App.jsx where the
 * canonical investorDemoEnabled state is available.
 */
export function useAuth({ fetchJson, setAssetClass, setMarket, setActiveTab, setMyStack, locale }) {
  const [userProfile, setUserProfile] = useLocalStorage('nova-quant-user-profile', {
    email: '',
    name: '',
    tradeMode: 'starter',
    broker: 'Robinhood',
  });
  const [authSession, setAuthSession] = useLocalStorage('nova-quant-auth-session', null);
  const [onboardingDone, setOnboardingDone] = useLocalStorage('nova-quant-onboarding-done', false, {
    legacyKeys: ['quant-demo-onboarding-done'],
  });
  const [uiMode, setUiMode] = useLocalStorage('nova-quant-ui-mode', 'standard', {
    legacyKeys: ['quant-demo-ui-mode'],
  });
  const [riskProfileKey, setRiskProfileKey] = useLocalStorage(
    'nova-quant-risk-profile',
    'balanced',
    {
      legacyKeys: ['quant-demo-risk-profile'],
    },
  );
  const [watchlist, setWatchlist] = useLocalStorage('nova-quant-watchlist', [], {
    legacyKeys: ['quant-demo-watchlist'],
  });
  const [executions, setExecutions] = useLocalStorage('nova-quant-executions', [], {
    legacyKeys: ['quant-demo-executions'],
  });
  const [holdings, setHoldings] = useLocalStorage('nova-quant-holdings', [], {
    legacyKeys: ['quant-demo-holdings'],
  });
  const [disciplineLog, setDisciplineLog] = useLocalStorage(
    'nova-quant-discipline-log',
    {
      checkins: [],
      boundary_kept: [],
      weekly_reviews: [],
    },
    { legacyKeys: ['quant-demo-discipline-log'] },
  );
  const [chatUserId] = useLocalStorage(
    'nova-quant-chat-user-id',
    `guest-${Math.random().toString(36).slice(2, 10)}`,
    { legacyKeys: ['quant-demo-chat-user-id'] },
  );

  const effectiveUserId = authSession?.userId || chatUserId;

  const applyAuthenticatedProfile = useCallback(
    (account, syncedState = null, options = {}) => {
      const { resetNavigation = false } = options;
      const tradeModeMap = {
        starter: 'beginner',
        active: 'standard',
        deep: 'advanced',
      };
      setUserProfile({
        email: account.email,
        name: account.name,
        tradeMode: account.tradeMode,
        broker: account.broker,
      });
      setAuthSession({
        userId: account.userId,
        email: normalizeEmail(account.email),
        name: account.name,
        tradeMode: account.tradeMode,
        broker: account.broker,
        loggedInAt: new Date().toISOString(),
      });
      setUiMode(syncedState?.uiMode || tradeModeMap[account.tradeMode] || 'standard');
      setRiskProfileKey(
        syncedState?.riskProfileKey ||
          (account.tradeMode === 'deep'
            ? 'aggressive'
            : account.tradeMode === 'starter'
              ? 'conservative'
              : 'balanced'),
      );
      setWatchlist(
        Array.isArray(syncedState?.watchlist) ? syncedState.watchlist : DEFAULT_AUTH_WATCHLIST,
      );
      setHoldings(Array.isArray(syncedState?.holdings) ? syncedState.holdings : []);
      setExecutions(Array.isArray(syncedState?.executions) ? syncedState.executions : []);
      if (syncedState?.disciplineLog) setDisciplineLog(syncedState.disciplineLog);
      setAssetClass(syncedState?.assetClass || 'US_STOCK');
      setMarket(syncedState?.market || 'US');
      setOnboardingDone(true);
      if (resetNavigation) {
        setActiveTab('today');
        setMyStack(['portfolio']);
      }
    },
    [
      setActiveTab,
      setAssetClass,
      setAuthSession,
      setDisciplineLog,
      setExecutions,
      setHoldings,
      setMarket,
      setMyStack,
      setOnboardingDone,
      setRiskProfileKey,
      setUiMode,
      setUserProfile,
      setWatchlist,
    ],
  );

  // Session hydration on mount
  useEffect(() => {
    if (authSession !== null) return undefined;
    let cancelled = false;
    void fetchJson('/api/auth/session')
      .then((payload) => {
        if (cancelled) return;
        if (payload?.authenticated && payload?.user) {
          applyAuthenticatedProfile(payload.user, payload.state || null, {
            resetNavigation: false,
          });
          return;
        }
        setAuthSession(null);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [applyAuthenticatedProfile, authSession, setAuthSession, fetchJson]);

  const handleLogin = useCallback(
    async ({ email, password }) => {
      try {
        const payload = await fetchJson('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        applyAuthenticatedProfile(payload.user, payload.state || null, {
          resetNavigation: true,
        });
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: classifyAuthError(error, locale),
        };
      }
    },
    [applyAuthenticatedProfile, fetchJson, locale],
  );

  const handleSignup = useCallback(
    async (payload) => {
      try {
        const response = await fetchJson('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: payload.email,
            password: payload.password,
            name: payload.name,
            tradeMode: payload.tradeMode,
            broker: payload.broker,
            locale,
          }),
        });
        applyAuthenticatedProfile(response.user, response.state || null, {
          resetNavigation: true,
        });
        return { ok: true };
      } catch (error) {
        const message = String(error?.message || '');
        return {
          ok: false,
          error:
            message.includes('(400)') ||
            message.includes('EMAIL_EXISTS') ||
            message.includes('INVALID_EMAIL') ||
            message.includes('WEAK_PASSWORD')
              ? locale?.startsWith('zh')
                ? '这个邮箱已经存在，或注册信息无效。'
                : 'That email already exists, or the signup details are invalid.'
              : message.includes('(503)') ||
                  message.includes('AUTH_STORE_NOT_CONFIGURED') ||
                  message.includes('AUTH_STORE_UNREACHABLE')
                ? locale?.startsWith('zh')
                  ? '注册服务当前未连上远端账户存储。请检查线上认证配置后再试。'
                  : 'The signup service cannot reach its remote auth store right now.'
                : locale?.startsWith('zh')
                  ? isLocalAuthRuntime()
                    ? '注册服务未连接。请先启动本地 API：npm run api:data'
                    : '注册服务暂时不可用。请稍后再试。'
                  : isLocalAuthRuntime()
                    ? 'The signup service is offline. Start the local API first: npm run api:data'
                    : 'The signup service is temporarily unavailable.',
        };
      }
    },
    [applyAuthenticatedProfile, fetchJson, locale],
  );

  const handleRequestReset = useCallback(
    async ({ email }) => {
      try {
        const payload = await fetchJson('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        return {
          ok: true,
          codeHint: payload.codeHint || null,
          expiresInMinutes: payload.expiresInMinutes || 15,
        };
      } catch (error) {
        const message = String(error?.message || '');
        return {
          ok: false,
          error:
            message.includes('(404)') ||
            message.includes('(500)') ||
            message.includes('(503)') ||
            message.includes('AUTH_STORE_NOT_CONFIGURED') ||
            message.includes('AUTH_STORE_UNREACHABLE')
              ? locale?.startsWith('zh')
                ? isLocalAuthRuntime()
                  ? '重置服务未连接。请先启动本地 API：npm run api:data'
                  : '重置服务暂时不可用。请稍后再试。'
                : isLocalAuthRuntime()
                  ? 'The reset service is offline. Start the local API first: npm run api:data'
                  : 'The reset service is temporarily unavailable.'
              : locale?.startsWith('zh')
                ? '暂时没法发送重置码，请稍后再试。'
                : 'We could not send a reset code just now.',
        };
      }
    },
    [fetchJson, locale],
  );

  const handleResetPassword = useCallback(
    async ({ email, code, newPassword }) => {
      try {
        await fetchJson('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code, newPassword }),
        });
        return { ok: true };
      } catch (error) {
        const message = String(error?.message || '');
        return {
          ok: false,
          error:
            message.includes('(400)') ||
            message.includes('INVALID_RESET_CODE') ||
            message.includes('WEAK_PASSWORD')
              ? locale?.startsWith('zh')
                ? '重置码无效，或密码不符合要求。'
                : 'The reset code is invalid, or the password is too weak.'
              : message.includes('(503)') ||
                  message.includes('AUTH_STORE_NOT_CONFIGURED') ||
                  message.includes('AUTH_STORE_UNREACHABLE')
                ? locale?.startsWith('zh')
                  ? '重置服务当前未连上远端账户存储。请检查线上认证配置后再试。'
                  : 'The reset service cannot reach its remote auth store right now.'
                : locale?.startsWith('zh')
                  ? isLocalAuthRuntime()
                    ? '重置服务未连接。请先启动本地 API：npm run api:data'
                    : '重置服务暂时不可用。请稍后再试。'
                  : isLocalAuthRuntime()
                    ? 'The reset service is offline. Start the local API first: npm run api:data'
                    : 'The reset service is temporarily unavailable.',
        };
      }
    },
    [fetchJson, locale],
  );

  const handleLogout = useCallback(() => {
    void fetchJson('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setHoldings([]);
    setWatchlist([]);
    setExecutions([]);
    setDisciplineLog({
      checkins: [],
      boundary_kept: [],
      weekly_reviews: [],
    });
    setAuthSession(null);
    setUserProfile({
      email: '',
      name: '',
      tradeMode: 'starter',
      broker: 'Robinhood',
    });
    setActiveTab('today');
    setMyStack(['portfolio']);
  }, [
    fetchJson,
    setAuthSession,
    setDisciplineLog,
    setExecutions,
    setHoldings,
    setUserProfile,
    setWatchlist,
    setActiveTab,
    setMyStack,
  ]);

  return {
    userProfile,
    authSession,
    setAuthSession,
    onboardingDone,
    setOnboardingDone,
    uiMode,
    setUiMode,
    riskProfileKey,
    setRiskProfileKey,
    watchlist,
    setWatchlist,
    executions,
    setExecutions,
    holdings,
    setHoldings,
    disciplineLog,
    setDisciplineLog,
    chatUserId,
    effectiveUserId,
    applyAuthenticatedProfile,
    handleLogin,
    handleSignup,
    handleRequestReset,
    handleResetPassword,
    handleLogout,
  };
}

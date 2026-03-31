import { useCallback, useEffect, useState } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { normalizeEmail, classifyAuthError, isLocalAuthRuntime } from '../utils/appHelpers';
import {
  ensureSupabaseBrowserClient,
  getSupabaseAuthRedirectUrl,
  hasSupabaseAuthBrowserConfig,
  loadSupabaseBrowserConfig,
} from '../utils/supabaseAuth';
import { DEFAULT_AUTH_WATCHLIST } from '../config/appConstants';

function classifySupabaseLoginError(error, locale) {
  const zh = locale?.startsWith('zh');
  const message = String(error?.message || '');
  if (/invalid login credentials/i.test(message)) {
    return zh
      ? '账号或密码错误。如果你是老账号，请先点 Forgot password 重置一次密码。'
      : 'The email or password is incorrect. If this is a legacy account, use Forgot password once to finish migration.';
  }
  if (/email not confirmed/i.test(message)) {
    return zh ? '请先完成邮箱验证。' : 'Please confirm your email first.';
  }
  return classifyAuthError(error, locale);
}

function classifySupabaseSignupError(error, locale) {
  const zh = locale?.startsWith('zh');
  const message = String(error?.message || '');
  if (/already registered|user already registered|email address is invalid|password/i.test(message)) {
    return zh ? '这个邮箱已经存在，或注册信息无效。' : 'That email already exists, or the signup details are invalid.';
  }
  if (/supabase auth not configured/i.test(message)) {
    return zh ? 'Supabase Auth 还没有配置完成。' : 'Supabase Auth is not configured yet.';
  }
  return zh
    ? isLocalAuthRuntime()
      ? '注册服务未连接。请先补齐本地 Supabase Auth 配置。'
      : '注册服务暂时不可用。请稍后再试。'
    : isLocalAuthRuntime()
      ? 'Supabase Auth is not configured for local development yet.'
      : 'The signup service is temporarily unavailable.';
}

function classifySupabaseResetError(error, locale) {
  const zh = locale?.startsWith('zh');
  const message = String(error?.message || '');
  if (/same password|password/i.test(message)) {
    return zh ? '密码不符合要求，请换一个更强的新密码。' : 'Please choose a stronger new password.';
  }
  return zh
    ? isLocalAuthRuntime()
      ? '重置服务未连接。请先补齐本地 Supabase Auth 配置。'
      : '重置服务暂时不可用。请稍后再试。'
    : isLocalAuthRuntime()
      ? 'Supabase Auth reset is not configured for local development yet.'
      : 'The reset service is temporarily unavailable.';
}

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
  const [authHydrated, setAuthHydrated] = useState(false);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
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

  const resetLocalAuthState = useCallback(
    ({ clearProfile = false } = {}) => {
      setHoldings([]);
      setWatchlist([]);
      setExecutions([]);
      setDisciplineLog({
        checkins: [],
        boundary_kept: [],
        weekly_reviews: [],
      });
      setAuthSession(null);
      if (clearProfile) {
        setUserProfile({
          email: '',
          name: '',
          tradeMode: 'starter',
          broker: 'Robinhood',
        });
      }
      setPasswordRecoveryMode(false);
      setActiveTab('today');
      setMyStack(['portfolio']);
    },
    [
      setActiveTab,
      setAuthSession,
      setDisciplineLog,
      setExecutions,
      setHoldings,
      setMyStack,
      setUserProfile,
      setWatchlist,
    ],
  );

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

  const hydrateSessionFromApi = useCallback(
    async ({ resetNavigation = false } = {}) => {
      const payload = await fetchJson('/api/auth/session');
      if (payload?.authenticated && payload?.user) {
        applyAuthenticatedProfile(payload.user, payload.state || null, {
          resetNavigation,
        });
        return true;
      }
      setAuthSession(null);
      return false;
    },
    [applyAuthenticatedProfile, fetchJson, setAuthSession],
  );

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      await loadSupabaseBrowserConfig();
      const supabaseEnabled = hasSupabaseAuthBrowserConfig();
      if (!supabaseEnabled) {
        try {
          const payload = await fetchJson('/api/auth/session');
          if (cancelled) return;
          if (payload?.authenticated && payload?.user) {
            applyAuthenticatedProfile(payload.user, payload.state || null, {
              resetNavigation: false,
            });
            return;
          }
          setAuthSession(null);
        } catch {
          if (!cancelled) {
            setAuthSession(null);
          }
        } finally {
          if (!cancelled) {
            setAuthHydrated(true);
          }
        }
        return;
      }

      const supabase = await ensureSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) setAuthHydrated(true);
        return;
      }

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session?.access_token) {
          await hydrateSessionFromApi({ resetNavigation: false });
        } else {
          setAuthSession(null);
        }
      } catch {
        if (!cancelled) {
          setAuthSession(null);
        }
      } finally {
        if (!cancelled) {
          setAuthHydrated(true);
        }
      }
    };

    void hydrate();
    let subscription = null;
    void loadSupabaseBrowserConfig().then(async () => {
      if (cancelled || !hasSupabaseAuthBrowserConfig()) return;
      const supabase = await ensureSupabaseBrowserClient();
      if (!supabase || cancelled) return;
      const authListener = supabase.auth.onAuthStateChange((event, session) => {
        if (cancelled) return;
        if (event === 'PASSWORD_RECOVERY') {
          setPasswordRecoveryMode(true);
        }
        if (event === 'SIGNED_OUT') {
          resetLocalAuthState({ clearProfile: false });
          setAuthHydrated(true);
          return;
        }
        if (session?.access_token) {
          void hydrateSessionFromApi({ resetNavigation: event === 'SIGNED_IN' }).finally(() => {
            if (!cancelled) {
              setAuthHydrated(true);
            }
          });
          return;
        }
        setAuthSession(null);
        setAuthHydrated(true);
      });
      subscription = authListener.data.subscription;
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [applyAuthenticatedProfile, fetchJson, hydrateSessionFromApi, resetLocalAuthState, setAuthSession]);

  const handleLogin = useCallback(
    async ({ email, password }) => {
      const supabase = await ensureSupabaseBrowserClient();
      if (supabase) {
        try {
          const { error } = await supabase.auth.signInWithPassword({
            email: normalizeEmail(email),
            password: String(password || ''),
          });
          if (error) {
            return {
              ok: false,
              error: classifySupabaseLoginError(error, locale),
            };
          }
          const authenticated = await hydrateSessionFromApi({ resetNavigation: true });
          return authenticated
            ? { ok: true }
            : {
                ok: false,
                error: locale?.startsWith('zh')
                  ? 'Supabase 登录成功了，但应用资料还没有同步完成。'
                  : 'Supabase login succeeded, but app profile sync is not ready yet.',
              };
        } catch (error) {
          return {
            ok: false,
            error: classifySupabaseLoginError(error, locale),
          };
        }
      }

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
    [applyAuthenticatedProfile, fetchJson, hydrateSessionFromApi, locale],
  );

  const handleSignup = useCallback(
    async (payload) => {
      const supabase = await ensureSupabaseBrowserClient();
      if (supabase) {
        try {
          const { data, error } = await supabase.auth.signUp({
            email: normalizeEmail(payload.email),
            password: String(payload.password || ''),
            options: {
              emailRedirectTo: getSupabaseAuthRedirectUrl(),
              data: {
                name: payload.name,
                tradeMode: payload.tradeMode,
                broker: payload.broker,
                locale,
              },
            },
          });
          if (error) {
            return {
              ok: false,
              error: classifySupabaseSignupError(error, locale),
            };
          }
          if (data?.session?.access_token) {
            await hydrateSessionFromApi({ resetNavigation: true });
            return { ok: true };
          }
          return {
            ok: true,
            pendingConfirmation: true,
            info: locale?.startsWith('zh')
              ? '验证邮件已经发出。请先完成邮箱验证，再回来登录。'
              : 'Check your inbox and confirm your email before logging in.',
          };
        } catch (error) {
          return {
            ok: false,
            error: classifySupabaseSignupError(error, locale),
          };
        }
      }

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
        return {
          ok: false,
          error:
            String(error?.message || '').includes('(400)') ||
            String(error?.message || '').includes('EMAIL_EXISTS') ||
            String(error?.message || '').includes('INVALID_EMAIL') ||
            String(error?.message || '').includes('WEAK_PASSWORD')
              ? locale?.startsWith('zh')
                ? '这个邮箱已经存在，或注册信息无效。'
                : 'That email already exists, or the signup details are invalid.'
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
    [applyAuthenticatedProfile, fetchJson, hydrateSessionFromApi, locale],
  );

  const handleRequestReset = useCallback(
    async ({ email }) => {
      const supabase = await ensureSupabaseBrowserClient();
      if (supabase) {
        try {
          const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
            redirectTo: getSupabaseAuthRedirectUrl(),
          });
          if (error) {
            return {
              ok: false,
              error: classifySupabaseResetError(error, locale),
            };
          }
          return {
            ok: true,
            info: locale?.startsWith('zh')
              ? '恢复邮件已发送，请从邮件里的链接继续。'
              : 'Recovery email sent. Continue from the link in your inbox.',
          };
        } catch (error) {
          return {
            ok: false,
            error: classifySupabaseResetError(error, locale),
          };
        }
      }

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
        return {
          ok: false,
          error:
            locale?.startsWith('zh')
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

  const handleResetPassword = useCallback(
    async ({ email, code, newPassword }) => {
      const supabase = await ensureSupabaseBrowserClient();
      if (supabase) {
        try {
          const { error } = await supabase.auth.updateUser({
            password: String(newPassword || ''),
          });
          if (error) {
            return {
              ok: false,
              error: classifySupabaseResetError(error, locale),
            };
          }
          setPasswordRecoveryMode(false);
          await hydrateSessionFromApi({ resetNavigation: true });
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            error: classifySupabaseResetError(error, locale),
          };
        }
      }

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
    [fetchJson, hydrateSessionFromApi, locale],
  );

  const handleLogout = useCallback(() => {
    void ensureSupabaseBrowserClient()
      .then((supabase) => {
        if (supabase) {
          return supabase.auth.signOut();
        }
        return fetchJson('/api/auth/logout', { method: 'POST' }).catch(() => {});
      })
      .catch(() => {});
    resetLocalAuthState({ clearProfile: true });
  }, [fetchJson, resetLocalAuthState]);

  return {
    userProfile,
    authSession,
    authHydrated,
    passwordRecoveryMode,
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

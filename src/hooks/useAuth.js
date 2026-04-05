import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { normalizeEmail, classifyAuthError } from '../utils/appHelpers';
import {
  ensureSupabaseBrowserClient,
  getSupabaseAuthRedirectUrl,
  hasSupabaseAuthBrowserConfig,
  loadSupabaseBrowserConfig,
  resendSupabaseSignupVerification,
  signUpWithSupabaseEmailVerification,
} from '../utils/supabaseAuth';
import { fetchApi } from '../utils/api';
import { DEFAULT_AUTH_WATCHLIST } from '../config/appConstants';
import { resolveSiteUrl, shouldRedirectToSiteAfterLogout } from '../shared/routes/publicUrls.js';

const RESILIENT_LOGIN_EMAILS = new Set(['zevs1120@gmail.com']);

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

function shouldAttemptLegacyServerLogin(error) {
  const message = String(error?.message || '');
  return /invalid login credentials/i.test(message);
}

function shouldForceLegacyLoginBridge(email) {
  return RESILIENT_LOGIN_EMAILS.has(normalizeEmail(email));
}

function classifySupabaseSignupError(error, locale) {
  const zh = locale?.startsWith('zh');
  const message = String(error?.message || '');
  if (/email.*rate limit|over_email_send_rate_limit|email rate limit exceeded/i.test(message)) {
    return zh
      ? '注册邮件发送太频繁了，当前被 Supabase 临时限流。请稍后再试。'
      : 'Signup emails are temporarily rate limited by Supabase. Please try again shortly.';
  }
  if (
    /already registered|user already registered|email address is invalid|password/i.test(message)
  ) {
    return zh
      ? '这个邮箱已经存在，或注册信息无效。'
      : 'That email already exists, or the signup details are invalid.';
  }
  if (/supabase auth not configured/i.test(message)) {
    return zh ? 'Supabase Auth 还没有配置完成。' : 'Supabase Auth is not configured yet.';
  }
  if (/email verification|confirm email/i.test(message)) {
    return zh
      ? '注册必须先经过邮箱验证。请检查 Supabase Auth 的 Confirm email 配置。'
      : 'Signup must require email verification. Check the Supabase Auth confirm-email setting.';
  }
  return zh ? '注册服务暂时不可用。请稍后再试。' : 'The signup service is temporarily unavailable.';
}

function classifySupabaseVerificationError(error, locale) {
  const zh = locale?.startsWith('zh');
  const message = String(error?.message || '');
  if (/supabase auth not configured/i.test(message)) {
    return zh ? 'Supabase Auth 还没有配置完成。' : 'Supabase Auth is not configured yet.';
  }
  if (/email.*rate limit|over_email_send_rate_limit/i.test(message)) {
    return zh
      ? '邮件发送太频繁了，请稍后再试。'
      : 'Too many verification email attempts. Please try again shortly.';
  }
  return zh
    ? '暂时没法重发验证邮件。请稍后再试。'
    : 'Could not resend the verification email right now.';
}

function classifySupabaseResetError(error, locale) {
  const zh = locale?.startsWith('zh');
  const message = String(error?.message || '');
  if (/same password|password/i.test(message)) {
    return zh ? '密码不符合要求，请换一个更强的新密码。' : 'Please choose a stronger new password.';
  }
  return zh ? '重置服务暂时不可用。请稍后再试。' : 'The reset service is temporarily unavailable.';
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
  const [authSession, setAuthSession] = useState(null);
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
  const signupInProgressRef = useRef(false);

  const normalizeRoles = useCallback(
    (roles) =>
      Array.isArray(roles)
        ? roles
            .map((role) =>
              String(role || '')
                .trim()
                .toUpperCase(),
            )
            .filter(Boolean)
        : [],
    [],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem('nova-quant-auth-session');
    } catch {
      // ignore storage access failures
    }
  }, []);

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
      setMyStack(['watchlist']);
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
      const { resetNavigation = false, roles = [] } = options;
      const normalizedRoles = normalizeRoles(roles);
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
        roles: normalizedRoles,
        isAdmin: normalizedRoles.includes('ADMIN'),
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
        setMyStack(['watchlist']);
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
      normalizeRoles,
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
          roles: payload.roles || [],
        });
        return true;
      }
      setAuthSession(null);
      return false;
    },
    [applyAuthenticatedProfile, fetchJson, setAuthSession],
  );

  const handleLegacyServerLogin = useCallback(
    async ({ email, password }) => {
      try {
        const response = await fetchApi('/api/auth/login', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: normalizeEmail(email),
            password: String(password || ''),
          }),
        });
        const payload = await response.json().catch(() => null);
        if (response.ok && payload?.authenticated && payload?.user) {
          const authenticated = await hydrateSessionFromApi({ resetNavigation: true });
          if (authenticated) {
            return { ok: true };
          }
          return {
            ok: false,
            error: locale?.startsWith('zh')
              ? '登录成功了，但应用资料还没有同步完成。'
              : 'Login succeeded, but app profile sync is not ready yet.',
          };
        }
        if (response.status === 401) {
          return {
            ok: false,
            error: locale?.startsWith('zh')
              ? '账号或密码错误。'
              : 'The email or password is incorrect.',
          };
        }
        if (response.status === 503) {
          return {
            ok: false,
            error: locale?.startsWith('zh')
              ? '登录服务暂时不可用。请稍后再试。'
              : 'The login service is temporarily unavailable. Please try again shortly.',
          };
        }
        return {
          ok: false,
          error:
            String(payload?.message || payload?.error || '').trim() ||
            (locale?.startsWith('zh')
              ? '登录暂时不可用。请稍后再试。'
              : 'The login service is temporarily unavailable.'),
        };
      } catch (error) {
        return {
          ok: false,
          error: locale?.startsWith('zh')
            ? '登录服务暂时不可用。请稍后再试。'
            : 'The login service is temporarily unavailable. Please try again shortly.',
        };
      }
    },
    [hydrateSessionFromApi, locale],
  );

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      await loadSupabaseBrowserConfig();
      try {
        const authenticated = await hydrateSessionFromApi({ resetNavigation: false });
        if (cancelled) return;
        if (authenticated) {
          setAuthHydrated(true);
          return;
        }
      } catch {
        // Fall through to direct Supabase session inspection below.
      }
      const supabaseEnabled = hasSupabaseAuthBrowserConfig();
      if (!supabaseEnabled) {
        if (!cancelled) {
          setAuthSession(null);
          setAuthHydrated(true);
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
          const hydrated = await hydrateSessionFromApi({ resetNavigation: false });
          if (!hydrated) {
            await supabase.auth.signOut().catch(() => {});
          }
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
          if (signupInProgressRef.current) return;
          resetLocalAuthState({ clearProfile: false });
          setAuthHydrated(true);
          return;
        }
        if (session?.access_token) {
          void hydrateSessionFromApi({ resetNavigation: event === 'SIGNED_IN' })
            .then(async (hydrated) => {
              if (!hydrated) {
                await supabase.auth.signOut().catch(() => {});
              }
            })
            .finally(() => {
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
  }, [
    applyAuthenticatedProfile,
    fetchJson,
    hydrateSessionFromApi,
    resetLocalAuthState,
    setAuthSession,
  ]);

  const handleLogin = useCallback(
    async ({ email, password }) => {
      const normalizedEmail = normalizeEmail(email);
      const normalizedPassword = String(password || '');
      const supabase = await ensureSupabaseBrowserClient();
      if (supabase) {
        try {
          const { error } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password: normalizedPassword,
          });
          if (error) {
            if (
              shouldForceLegacyLoginBridge(normalizedEmail) ||
              shouldAttemptLegacyServerLogin(error)
            ) {
              const legacyResult = await handleLegacyServerLogin({
                email: normalizedEmail,
                password: normalizedPassword,
              });
              if (legacyResult.ok) return legacyResult;
            }
            return {
              ok: false,
              error: classifySupabaseLoginError(error, locale),
            };
          }
          const authenticated = await hydrateSessionFromApi({ resetNavigation: true });
          if (!authenticated) {
            await supabase.auth.signOut().catch(() => {});
          }
          return authenticated
            ? { ok: true }
            : {
                ok: false,
                error: locale?.startsWith('zh')
                  ? 'Supabase 登录成功了，但应用资料还没有同步完成。'
                  : 'Supabase login succeeded, but app profile sync is not ready yet.',
              };
        } catch (error) {
          if (
            shouldForceLegacyLoginBridge(normalizedEmail) ||
            shouldAttemptLegacyServerLogin(error)
          ) {
            const legacyResult = await handleLegacyServerLogin({
              email: normalizedEmail,
              password: normalizedPassword,
            });
            if (legacyResult.ok) return legacyResult;
          }
          return {
            ok: false,
            error: classifySupabaseLoginError(error, locale),
          };
        }
      }

      return handleLegacyServerLogin({
        email: normalizedEmail,
        password: normalizedPassword,
      });
    },
    [handleLegacyServerLogin, hydrateSessionFromApi, locale],
  );

  const handleSignup = useCallback(
    async (payload) => {
      try {
        signupInProgressRef.current = true;
        setAuthSession(null);
        const mainClient = await ensureSupabaseBrowserClient();
        await mainClient?.auth.signOut().catch(() => {});
        const { data, error } = await signUpWithSupabaseEmailVerification({
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
        const emailConfirmedImmediately = Boolean(
          data?.user?.email_confirmed_at || data?.user?.confirmed_at,
        );
        await mainClient?.auth.signOut().catch(() => {});
        if (data?.session?.access_token || emailConfirmedImmediately) {
          return {
            ok: false,
            error: locale?.startsWith('zh')
              ? '注册流程必须先经过邮箱验证。请在 Supabase Auth 里开启 Confirm email。'
              : 'Signup must require email verification. Enable Confirm email in Supabase Auth.',
          };
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
      } finally {
        signupInProgressRef.current = false;
      }
    },
    [locale],
  );

  const handleResendSignupVerification = useCallback(
    async ({ email }) => {
      const normalizedEmail = normalizeEmail(email);
      if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
        return {
          ok: false,
          error: locale?.startsWith('zh')
            ? '请先输入有效邮箱。'
            : 'Enter a valid email address first.',
        };
      }
      try {
        const { error } = await resendSupabaseSignupVerification({
          email: normalizedEmail,
          emailRedirectTo: getSupabaseAuthRedirectUrl(),
        });
        if (error) {
          return {
            ok: false,
            error: classifySupabaseVerificationError(error, locale),
          };
        }
        return {
          ok: true,
          info: locale?.startsWith('zh')
            ? '验证邮件已重新发送，请检查收件箱和垃圾邮件。'
            : 'Verification email resent. Please check your inbox and spam folder.',
        };
      } catch (error) {
        return {
          ok: false,
          error: classifySupabaseVerificationError(error, locale),
        };
      }
    },
    [locale],
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

      return {
        ok: false,
        error: locale?.startsWith('zh')
          ? 'Supabase Auth 还没有配置完成。'
          : 'Supabase Auth is not configured yet.',
      };
    },
    [locale],
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

      return {
        ok: false,
        error: locale?.startsWith('zh')
          ? 'Supabase Auth 还没有配置完成。'
          : 'Supabase Auth is not configured yet.',
      };
    },
    [hydrateSessionFromApi, locale],
  );

  const handleLogout = useCallback(() => {
    void Promise.allSettled([
      ensureSupabaseBrowserClient()
        .then((supabase) => {
          if (supabase) {
            return supabase.auth.signOut();
          }
          return null;
        })
        .catch(() => {}),
      fetchApi('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      }).catch(() => null),
    ]);
    resetLocalAuthState({ clearProfile: true });
    if (typeof window !== 'undefined' && shouldRedirectToSiteAfterLogout()) {
      window.location.assign(resolveSiteUrl());
    }
  }, [resetLocalAuthState]);

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
    handleResendSignupVerification,
    handleRequestReset,
    handleResetPassword,
    handleLogout,
  };
}

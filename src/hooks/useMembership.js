import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalStorage } from './useLocalStorage';
import {
  getMembershipLimits,
  getRemainingAskNova,
  isPortfolioAiEnabled,
  isPortfolioAwareRequest,
  membershipPlanName,
  membershipUsageDay,
  normalizeMembershipPlan,
  normalizeMembershipUsage,
} from '../utils/membership';

function buildPromptCopy(reason, locale, extras = {}) {
  const zh = String(locale || '')
    .toLowerCase()
    .startsWith('zh');

  if (reason === 'today_locked') {
    return {
      source: reason,
      targetPlan: 'lite',
      eyebrow: zh ? 'Today 已锁定' : 'Today locked',
      title: zh ? '解锁今天剩余的决策卡片' : 'Unlock the rest of today',
      body: zh
        ? `你已经看完免费的 ${extras.freeCardLimit || 3} 张卡。升级 Lite 继续查看剩余机会，并保留你的券商路径。`
        : `You have used your free ${extras.freeCardLimit || 3} cards. Upgrade to Lite to see the rest of today and keep your broker flow ready.`,
    };
  }

  if (reason === 'today_execution') {
    return {
      source: reason,
      targetPlan: 'lite',
      eyebrow: zh ? 'Keep your broker' : 'Keep your broker',
      title: zh ? '升级 Lite 才能执行并联动券商' : 'Upgrade to Lite to act with broker handoff',
      body: zh
        ? `你已经看到 ${extras.symbol || '这张'} 卡片的建议。Lite 会解锁执行确认和 broker handoff。`
        : `You have the call for ${extras.symbol || 'this setup'}. Lite unlocks execution confirmation and broker handoff.`,
    };
  }

  if (reason === 'portfolio_ai') {
    return {
      source: reason,
      targetPlan: 'pro',
      eyebrow: zh ? 'Ask Nova Pro' : 'Ask Nova Pro',
      title: zh ? '组合感知问答属于 Pro' : 'Portfolio-aware answers live in Pro',
      body: zh
        ? '涉及持仓、仓位、组合和风险画像的问题，会使用更深的账户上下文。升级 Pro 才能解锁。'
        : 'Questions about holdings, sizing, portfolio structure, and risk profile use deeper account context. Upgrade to Pro to unlock them.',
    };
  }

  return {
    source: 'ai_limit',
    targetPlan: extras.currentPlan === 'lite' ? 'pro' : 'lite',
    eyebrow: zh ? 'Ask Nova' : 'Ask Nova',
    title: zh ? '你今天的 Ask Nova 次数用完了' : 'You have used today’s Ask Nova limit',
    body:
      extras.currentPlan === 'lite'
        ? zh
          ? '继续升级到 Pro，解锁更深的上下文和更高额度。'
          : 'Go Pro for deeper context and a much higher usage ceiling.'
        : zh
          ? '升级 Lite，继续问今天的市场和交易问题。'
          : 'Upgrade to Lite to keep asking about today’s market and trade setups.',
  };
}

function normalizeRemoteMembershipState(value, fallbackDay) {
  if (!value || typeof value !== 'object') return null;
  const plan = normalizeMembershipPlan(value.currentPlan);
  const usageDay = String(value?.usage?.day || fallbackDay || '').trim() || fallbackDay;
  const askNovaUsed = Number(value?.usage?.askNovaUsed || 0);
  return {
    ...value,
    currentPlan: plan,
    limits: value?.limits || getMembershipLimits(plan),
    usage: {
      day: usageDay,
      askNovaUsed: Number.isFinite(askNovaUsed) ? Math.max(0, Math.floor(askNovaUsed)) : 0,
    },
    remainingAskNova:
      value?.remainingAskNova === null || Number.isFinite(Number(value?.remainingAskNova))
        ? value?.remainingAskNova
        : getRemainingAskNova(plan, {
            day: usageDay,
            askNovaUsed,
          }),
  };
}

export function useMembership({ locale, authSession, fetchJson }) {
  const today = membershipUsageDay();
  const [plan, setPlan] = useLocalStorage('nova-quant-membership-plan', 'free');
  const [usageState, setUsageState] = useLocalStorage('nova-quant-membership-usage', {
    day: today,
    askNovaUsed: 0,
  });
  const [prompt, setPrompt] = useState(null);
  const [remoteState, setRemoteState] = useState(null);

  const currentPlan = normalizeMembershipPlan(remoteState?.currentPlan || plan);
  const localUsage = useMemo(
    () => normalizeMembershipUsage(usageState, today),
    [usageState, today],
  );
  const usage = useMemo(
    () =>
      remoteState?.usage
        ? normalizeMembershipUsage(remoteState.usage, remoteState.usage?.day || today)
        : localUsage,
    [localUsage, remoteState, today],
  );
  const limits = useMemo(
    () => remoteState?.limits || getMembershipLimits(currentPlan),
    [currentPlan, remoteState],
  );
  const remainingAskNova = useMemo(
    () =>
      remoteState?.remainingAskNova === null ||
      Number.isFinite(Number(remoteState?.remainingAskNova))
        ? remoteState?.remainingAskNova
        : getRemainingAskNova(currentPlan, usage),
    [currentPlan, remoteState, usage],
  );

  useEffect(() => {
    setUsageState((current) => normalizeMembershipUsage(current, today));
  }, [today, setUsageState]);

  const syncMembershipState = useCallback(async () => {
    if (!authSession?.userId || !fetchJson) {
      setRemoteState(null);
      return false;
    }
    try {
      const payload = await fetchJson('/api/membership/state');
      const normalized = normalizeRemoteMembershipState(payload, today);
      setRemoteState(normalized);
      if (normalized?.currentPlan) {
        setPlan(normalized.currentPlan);
      }
      return true;
    } catch {
      return false;
    }
  }, [authSession?.userId, fetchJson, setPlan, today]);

  useEffect(() => {
    if (!authSession?.userId || !fetchJson) {
      setRemoteState(null);
      return;
    }
    void syncMembershipState();
  }, [authSession?.userId, fetchJson, syncMembershipState]);

  const openPrompt = useCallback(
    (reasonOrPrompt, extras = {}) => {
      if (reasonOrPrompt && typeof reasonOrPrompt === 'object' && reasonOrPrompt.title) {
        setPrompt(reasonOrPrompt);
        return false;
      }
      setPrompt(buildPromptCopy(reasonOrPrompt, locale, extras));
      return false;
    },
    [locale],
  );

  const closePrompt = useCallback(() => {
    setPrompt(null);
  }, []);

  const setMembershipPlan = useCallback(
    (nextPlan) => {
      const normalizedPlan = normalizeMembershipPlan(nextPlan);
      setPlan(normalizedPlan);
      setRemoteState((current) =>
        current
          ? {
              ...current,
              currentPlan: normalizedPlan,
              limits: getMembershipLimits(normalizedPlan),
              remainingAskNova: getRemainingAskNova(normalizedPlan, current.usage || usage),
            }
          : current,
      );
      setPrompt(null);
    },
    [setPlan, usage],
  );

  const requestAiAccess = useCallback(
    ({ message, context = {} }) => {
      if (!isPortfolioAiEnabled(currentPlan) && isPortfolioAwareRequest(message, context)) {
        return openPrompt('portfolio_ai');
      }

      if (remainingAskNova !== null && remainingAskNova <= 0) {
        return openPrompt('ai_limit', { currentPlan });
      }

      if (authSession?.userId && remoteState?.usage && remainingAskNova !== null) {
        setRemoteState((current) => {
          if (!current) return current;
          const normalized = normalizeMembershipUsage(current.usage, current.usage?.day || today);
          const nextUsed = normalized.askNovaUsed + 1;
          return {
            ...current,
            usage: {
              day: normalized.day,
              askNovaUsed: nextUsed,
            },
            remainingAskNova:
              current.remainingAskNova === null ? null : Math.max(0, current.remainingAskNova - 1),
          };
        });
        return true;
      }

      setUsageState((current) => {
        const normalized = normalizeMembershipUsage(current, today);
        return {
          ...normalized,
          askNovaUsed: normalized.askNovaUsed + 1,
        };
      });
      return true;
    },
    [
      authSession?.userId,
      currentPlan,
      openPrompt,
      remainingAskNova,
      remoteState,
      setUsageState,
      today,
    ],
  );

  return {
    currentPlan,
    currentPlanName: membershipPlanName(currentPlan, locale),
    limits,
    usage,
    remainingAskNova,
    prompt,
    setMembershipPlan,
    syncMembershipState,
    openPrompt,
    closePrompt,
    requestAiAccess,
  };
}

export const MEMBERSHIP_PLAN_ORDER = Object.freeze(['free', 'lite', 'pro']);

export const MEMBERSHIP_LIMITS = Object.freeze({
  free: Object.freeze({
    todayCards: 3,
    askNovaDaily: 3,
    brokerHandoff: false,
    portfolioAi: false,
  }),
  lite: Object.freeze({
    todayCards: null,
    askNovaDaily: 20,
    brokerHandoff: true,
    portfolioAi: false,
  }),
  pro: Object.freeze({
    todayCards: null,
    askNovaDaily: null,
    brokerHandoff: true,
    portfolioAi: true,
  }),
});

export const MEMBERSHIP_PRICING = Object.freeze({
  free: Object.freeze({
    monthly: 0,
    annual: 0,
  }),
  lite: Object.freeze({
    monthly: 1900,
    annual: 19000,
  }),
  pro: Object.freeze({
    monthly: 4900,
    annual: 49000,
  }),
});

function safeInteger(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(0, Math.floor(next)) : fallback;
}

export function normalizeMembershipPlan(value) {
  const next = String(value || '')
    .trim()
    .toLowerCase();
  return MEMBERSHIP_PLAN_ORDER.includes(next) ? next : 'free';
}

export function membershipUsageDay(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeMembershipUsage(value, day = membershipUsageDay()) {
  if (!value || typeof value !== 'object') {
    return {
      day,
      askNovaUsed: 0,
    };
  }
  const usageDay = String(value.day || '').trim() || day;
  return {
    day: usageDay,
    askNovaUsed: usageDay === day ? safeInteger(value.askNovaUsed) : 0,
  };
}

export function membershipPlanRank(plan) {
  return MEMBERSHIP_PLAN_ORDER.indexOf(normalizeMembershipPlan(plan));
}

export function getMembershipLimits(plan) {
  return MEMBERSHIP_LIMITS[normalizeMembershipPlan(plan)];
}

export function getMembershipPriceCents(plan, billingCycle = 'monthly') {
  const normalizedPlan = normalizeMembershipPlan(plan);
  const normalizedCycle = billingCycle === 'annual' ? 'annual' : 'monthly';
  return MEMBERSHIP_PRICING[normalizedPlan]?.[normalizedCycle] ?? 0;
}

export function formatMembershipPrice(plan, billingCycle = 'monthly', locale = 'en-US') {
  const amountCents = getMembershipPriceCents(plan, billingCycle);
  if (amountCents <= 0) {
    return String(locale || '')
      .toLowerCase()
      .startsWith('zh')
      ? '免费'
      : 'Free';
  }
  return new Intl.NumberFormat(locale || 'en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

export function membershipBillingCycleLabel(billingCycle = 'monthly', locale = 'en-US') {
  const normalizedCycle = billingCycle === 'annual' ? 'annual' : 'monthly';
  const zh = String(locale || '')
    .toLowerCase()
    .startsWith('zh');
  if (normalizedCycle === 'annual') {
    return zh ? '/ 年' : '/ year';
  }
  return zh ? '/ 月' : '/ month';
}

export function getRemainingAskNova(plan, usage) {
  const limits = getMembershipLimits(plan);
  const normalizedUsage = normalizeMembershipUsage(usage);
  if (limits.askNovaDaily === null) return null;
  return Math.max(0, limits.askNovaDaily - safeInteger(normalizedUsage.askNovaUsed));
}

export function isPortfolioAiEnabled(plan) {
  return Boolean(getMembershipLimits(plan).portfolioAi);
}

export function isBrokerHandoffEnabled(plan) {
  return Boolean(getMembershipLimits(plan).brokerHandoff);
}

export function getTodayCardLimit(plan) {
  return getMembershipLimits(plan).todayCards;
}

export function isPortfolioAwareRequest(message, context = {}) {
  const text = String(message || '').toLowerCase();
  const page = String(context?.page || '').toLowerCase();
  const focus = String(context?.focus || '').toLowerCase();
  const target = String(context?.target || '').toLowerCase();

  if (
    page === 'portfolio' ||
    page === 'holdings' ||
    page === 'weekly' ||
    focus === 'portfolio' ||
    target === 'holdings'
  ) {
    return true;
  }

  const keywords = [
    'holding',
    'holdings',
    'portfolio',
    'position size',
    'allocation',
    'weight',
    'my risk',
    'my account',
    'my exposure',
    '持仓',
    '仓位',
    '组合',
    '账户',
    '风险画像',
    '风险偏好',
    '仓位大小',
    '敞口',
  ];
  return keywords.some((keyword) => text.includes(keyword));
}

export function buildMembershipPlans(locale = 'en-US') {
  const zh = String(locale || '')
    .toLowerCase()
    .startsWith('zh');
  return [
    {
      key: 'free',
      name: 'Free',
      price: zh ? '免费' : 'Free',
      cadence: '',
      blurb: zh ? '先理解今天，再决定是否值得升级。' : 'Get the read before you decide to upgrade.',
      features: zh
        ? ['每天 3 张 Today 卡片', '每天 3 次 Ask Nova', '完整 Browse 体验']
        : ['3 Today cards per day', '3 Ask Nova questions per day', 'Full Browse access'],
    },
    {
      key: 'lite',
      name: 'Lite',
      price: '$19',
      cadence: zh ? '/ 月' : '/ month',
      blurb: zh
        ? '给日常使用而设计。完整 Today，加更多 Ask Nova。'
        : 'Built for daily use. Full Today plus more Ask Nova.',
      features: zh
        ? ['完整 Today 决策流', '每天 20 次 Ask Nova', 'Broker handoff']
        : ['Full Today flow', '20 Ask Nova questions per day', 'Broker handoff'],
    },
    {
      key: 'pro',
      name: 'Pro',
      price: '$49',
      cadence: zh ? '/ 月' : '/ month',
      blurb: zh
        ? '更深的 AI 决策层。带持仓、风险和组合上下文。'
        : 'The deeper AI layer with holdings, risk, and portfolio context.',
      features: zh
        ? ['Lite 全部权益', '组合/持仓感知问答', '高级风险与周复盘上下文']
        : ['Everything in Lite', 'Portfolio-aware Ask Nova', 'Deeper risk and weekly context'],
    },
  ];
}

export function membershipPlanName(plan, locale = 'en-US') {
  const normalized = normalizeMembershipPlan(plan);
  return buildMembershipPlans(locale).find((item) => item.key === normalized)?.name || 'Free';
}

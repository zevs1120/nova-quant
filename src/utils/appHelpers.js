export function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function isLocalAuthRuntime() {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

export function classifyAuthError(error, locale) {
  const zh = locale?.startsWith('zh');
  const message = String(error?.message || '');
  if (message.includes('(401)') || message.includes('INVALID_CREDENTIALS')) {
    return zh ? '账号或密码错误。' : 'The email or password is incorrect.';
  }
  if (
    message.includes('(503)') ||
    message.includes('AUTH_STORE_NOT_CONFIGURED') ||
    message.includes('AUTH_STORE_UNREACHABLE')
  ) {
    return zh
      ? '登录服务当前未连上远端账户存储。请检查线上认证配置后再试。'
      : 'The login service cannot reach its remote auth store right now.';
  }
  return zh
    ? isLocalAuthRuntime()
      ? '登录服务未连接。请先启动本地 API：npm run api:data'
      : '登录服务暂时不可用。请稍后再试。'
    : isLocalAuthRuntime()
      ? 'The login service is offline. Start the local API first: npm run api:data'
      : 'The login service is temporarily unavailable.';
}

export function detectDisplayMode() {
  if (typeof window === 'undefined') return 'browser';
  if (window.matchMedia?.('(display-mode: standalone)').matches) return 'standalone';
  if (window.matchMedia?.('(display-mode: fullscreen)').matches) return 'fullscreen';
  if (window.navigator?.standalone) return 'standalone';
  return 'browser';
}

export function settledValue(result, fallback = null) {
  return result?.status === 'fulfilled' ? result.value : fallback;
}

export function mapExecutionToTrade(execution) {
  const baseTime = execution.created_at || new Date().toISOString();
  const pnl = Number(execution.pnl_pct ?? execution.pnlPct ?? 0);
  return {
    time_in: baseTime,
    time_out: baseTime,
    market: execution.market,
    symbol: execution.symbol,
    side: execution.side || execution.direction || 'LONG',
    entry: Number(execution.entry ?? execution.entry_price ?? 0),
    exit: Number(
      execution.exit ?? execution.tp_price ?? execution.entry ?? execution.entry_price ?? 0,
    ),
    pnl_pct: pnl,
    fees: Number(execution.fees ?? 0),
    signal_id: execution.signal_id || execution.signalId,
    source: execution.mode || 'PAPER',
  };
}

export function buildOnboardingRetrySessionKey(authSession) {
  const userId = String(authSession?.userId || '').trim();
  const loggedInAt = String(authSession?.loggedInAt || '').trim();
  if (!userId || !loggedInAt) return null;
  return `${userId}:${loggedInAt}`;
}

export function shouldAttemptPendingOnboardingBonusRetry(args) {
  const retrySessionKey = String(args?.retrySessionKey || '').trim();
  const effectiveUserId = String(args?.effectiveUserId || '').trim();
  if (!retrySessionKey || !effectiveUserId || args?.isDemoRuntime) return false;
  if (!args?.pendingByUser?.[effectiveUserId]) return false;
  return String(args?.attemptedSessionKey || '').trim() !== retrySessionKey;
}

export function runWhenIdle(task) {
  if (typeof window === 'undefined') return () => {};
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(task, { timeout: 1200 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(task, 180);
  return () => window.clearTimeout(id);
}

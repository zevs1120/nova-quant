function toNumber(value, fallback = null) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function normalizedBroker(value) {
  return String(value || 'Robinhood').trim();
}

function inferAssetClass(signal = {}) {
  if (signal.asset_class) return signal.asset_class;
  if (signal.market === 'CRYPTO') return 'CRYPTO';
  return 'US_STOCK';
}

function inferOrderType(signal = {}) {
  const method = String(signal.entry_method || signal.order_type || '').toUpperCase();
  if (method.includes('MARKET')) return 'MARKET';
  return 'LIMIT';
}

function baseCryptoSymbol(symbol = '') {
  return String(symbol || '')
    .toUpperCase()
    .replace(/[-_/].*$/, '')
    .replace(/USDT$/, '')
    .replace(/USD$/, '');
}

function brokerLaunchUrl({ broker, signal }) {
  const selected = normalizedBroker(broker).toLowerCase();
  const assetClass = inferAssetClass(signal);
  const symbol = String(signal?.symbol || '').trim().toUpperCase();

  if (!symbol) return null;

  if (selected === 'robinhood') {
    if (assetClass === 'US_STOCK') {
      return `https://robinhood.com/us/en/stocks/${encodeURIComponent(symbol)}/`;
    }
    if (assetClass === 'CRYPTO') {
      const base = baseCryptoSymbol(symbol);
      if (base) return `https://robinhood.com/us/en/crypto/${encodeURIComponent(base)}/`;
    }
  }

  return null;
}

function positionLabel(sizePct) {
  if (!Number.isFinite(sizePct) || sizePct <= 0) return 'watch only';
  if (sizePct <= 5) return 'starter';
  if (sizePct <= 12) return 'small';
  if (sizePct <= 20) return 'active';
  return 'capped';
}

function copyPayload(intent) {
  const tpLine = (intent.targets || []).map((row) => row.price).filter((value) => Number.isFinite(value)).join(' | ');
  return [
    `symbol: ${intent.symbol}`,
    `market: ${intent.market}`,
    `asset_class: ${intent.assetClass}`,
    `side: ${intent.side}`,
    `order_type: ${intent.orderType}`,
    `entry_range: ${intent.entryLabel}`,
    `entry_mid: ${Number.isFinite(intent.entryMid) ? intent.entryMid : '--'}`,
    `stop_loss: ${Number.isFinite(intent.stopLoss) ? intent.stopLoss : '--'}`,
    `targets: ${tpLine || '--'}`,
    `size_pct: ${Number.isFinite(intent.sizePct) ? intent.sizePct : '--'}`,
    `signal_id: ${intent.signalId || '--'}`,
    `strategy_id: ${intent.strategyId || '--'}`,
    `why_now: ${intent.whyNow || '--'}`,
    `risk_note: ${intent.riskNote || '--'}`
  ].join('\n');
}

export function buildTradeIntent(signal = {}, options = {}) {
  const broker = normalizedBroker(options.broker || options.userBroker);
  const assetClass = inferAssetClass(signal);
  const entryLow = toNumber(signal?.entry_zone?.low ?? signal?.entry_zone?.min ?? signal?.entry_min);
  const entryHigh = toNumber(signal?.entry_zone?.high ?? signal?.entry_zone?.max ?? signal?.entry_max, entryLow);
  const entryMid =
    Number.isFinite(entryLow) && Number.isFinite(entryHigh)
      ? round((entryLow + entryHigh) / 2, 4)
      : (entryLow ?? entryHigh);
  const stopLoss = toNumber(signal?.stop_loss?.price ?? signal?.stop_loss_value ?? signal?.invalidation_level ?? signal?.stop_loss);
  const sizePct = toNumber(signal?.position_advice?.position_pct ?? signal?.position_size_pct ?? signal?.position_pct);
  const rawTargets = Array.isArray(signal?.take_profit_levels) && signal.take_profit_levels.length
    ? signal.take_profit_levels
    : [signal?.take_profit].filter((value) => value !== null && value !== undefined);
  const targets = rawTargets
    .map((row, index) => ({
      index: index + 1,
      price: toNumber(typeof row === 'number' ? row : row?.price),
      sizePct: toNumber(typeof row === 'number' ? null : row?.size_pct)
    }))
    .filter((row) => Number.isFinite(row.price));

  const entryLabel =
    Number.isFinite(entryLow) && Number.isFinite(entryHigh)
      ? Math.abs(entryLow - entryHigh) < 0.0001
        ? `${entryLow.toFixed(2)}`
        : `${entryLow.toFixed(2)} - ${entryHigh.toFixed(2)}`
      : '--';

  const launchUrl = brokerLaunchUrl({ broker, signal });
  const brokerSnapshot = options.brokerSnapshot || null;
  const canTradeApi = Boolean(brokerSnapshot?.provider === 'ALPACA' && brokerSnapshot?.can_trade);

  const intent = {
    id: `${String(signal?.signal_id || signal?.symbol || 'intent')}-intent`,
    signalId: signal?.signal_id || null,
    symbol: String(signal?.symbol || '').trim().toUpperCase(),
    market: String(signal?.market || (assetClass === 'CRYPTO' ? 'CRYPTO' : 'US')).toUpperCase(),
    assetClass,
    side: String(signal?.direction || 'LONG').toUpperCase(),
    orderType: inferOrderType(signal),
    entryLow,
    entryHigh,
    entryMid,
    entryLabel,
    stopLoss,
    targets,
    sizePct,
    sizeLabel: positionLabel(sizePct),
    confidencePct: Number.isFinite(Number(signal?.confidence ?? signal?.conviction))
      ? Math.round(Number(signal?.confidence ?? signal?.conviction) * 100)
      : null,
    strategyId: signal?.strategy_id || null,
    strategySource: signal?.strategy_source || 'AI quant strategy',
    signalStatus: signal?.status || null,
    whyNow: signal?.brief_why_now || signal?.explain_bullets?.[0] || null,
    riskNote: signal?.risk_note || signal?.brief_caution || null,
    invalidation: signal?.invalidation_level ?? stopLoss,
    broker,
    brokerLaunchUrl: launchUrl,
    canOpenBroker: Boolean(launchUrl),
    canTradeApi,
    checklist: Array.isArray(signal?.execution_checklist) ? signal.execution_checklist : [],
    copyText: ''
  };

  intent.copyText = copyPayload(intent);
  return intent;
}

export function buildNovaTradeQuestion(signal = {}, intent = {}, locale = 'en') {
  const isZh = String(locale || '').startsWith('zh');
  const targetSummary = (intent.targets || [])
    .map((row) => (Number.isFinite(row.price) ? row.price : null))
    .filter(Boolean)
    .join(' / ');

  if (isZh) {
    return [
      `请根据这张行动卡，帮我把 ${intent.symbol || signal?.symbol || '这个标的'} 的执行计划讲清楚。`,
      `方向 ${intent.side || signal?.direction || '--'}，入场区间 ${intent.entryLabel || '--'}，止损 ${intent.stopLoss ?? '--'}，目标 ${targetSummary || '--'}，建议仓位 ${intent.sizePct ?? '--'}%。`,
      '请按四部分回答：现在能不能做、怎么挂单、什么情况不该做、做错后怎么处理。'
    ].join(' ');
  }

  return [
    `Review this action card for ${intent.symbol || signal?.symbol || 'this setup'}.`,
    `Side ${intent.side || signal?.direction || '--'}, entry ${intent.entryLabel || '--'}, stop ${intent.stopLoss ?? '--'}, target ${targetSummary || '--'}, size ${intent.sizePct ?? '--'}%.`,
    'Answer in four parts: can I take it now, how to place it, when not to take it, and how to manage it if it fails.'
  ].join(' ');
}

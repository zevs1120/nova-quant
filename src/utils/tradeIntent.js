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

function normalizedBrokerKey(value) {
  return normalizedBroker(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
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

function toParamValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(round(value, 4)) : '';
  }
  return String(value);
}

function brokerSide(side = '') {
  const normalized = String(side || '').trim().toUpperCase();
  if (normalized === 'SHORT' || normalized === 'SELL') return 'sell';
  return 'buy';
}

function applyUrlTemplate(template, context) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) =>
    encodeURIComponent(toParamValue(context[key]))
  );
}

function readConfiguredBrokerTemplates() {
  const raw = import.meta.env?.VITE_BROKER_HANDOFF_TEMPLATES;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const DEFAULT_BROKER_HANDOFFS = {
  robinhood: {
    kind: 'asset_page',
    label: 'Robinhood',
    stockUrl: 'https://robinhood.com/us/en/stocks/{{symbol}}/',
    cryptoUrl: 'https://robinhood.com/us/en/crypto/{{baseSymbol}}/'
  }
};

function resolveBrokerTemplate(broker) {
  const configured = readConfiguredBrokerTemplates();
  const key = normalizedBrokerKey(broker);
  return configured[key] || configured[normalizedBroker(broker)] || DEFAULT_BROKER_HANDOFFS[key] || null;
}

function buildBrokerHandoff({ broker, signal, intent }) {
  const assetClass = inferAssetClass(signal);
  const symbol = String(signal?.symbol || '').trim().toUpperCase();

  if (!symbol) return null;
  const template = resolveBrokerTemplate(broker);
  if (!template) return null;

  const context = {
    broker: normalizedBroker(broker),
    symbol,
    baseSymbol: baseCryptoSymbol(symbol),
    market: intent.market,
    assetClass,
    side: intent.side,
    brokerSide: brokerSide(intent.side),
    orderType: intent.orderType,
    orderTypeLower: String(intent.orderType || '').toLowerCase(),
    entryLow: intent.entryLow,
    entryHigh: intent.entryHigh,
    entryMid: intent.entryMid,
    stopLoss: intent.stopLoss,
    invalidation: intent.invalidation,
    sizePct: intent.sizePct,
    target1: intent.targets?.[0]?.price ?? null,
    target2: intent.targets?.[1]?.price ?? null,
    target3: intent.targets?.[2]?.price ?? null,
    signalId: intent.signalId,
    strategyId: intent.strategyId
  };

  const templateUrl =
    (assetClass === 'CRYPTO' ? template.cryptoUrl : template.stockUrl) ||
    template.url ||
    null;
  if (!templateUrl) return null;

  return {
    url: applyUrlTemplate(templateUrl, context),
    kind: template.kind === 'prefilled_ticket' ? 'prefilled_ticket' : 'asset_page',
    brokerLabel: template.label || normalizedBroker(broker)
  };
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
    brokerHandoffUrl: null,
    brokerHandoffKind: 'copy_only',
    canOpenBroker: false,
    handoffPrefillsTicket: false,
    checklist: Array.isArray(signal?.execution_checklist) ? signal.execution_checklist : [],
    copyText: ''
  };

  const brokerHandoff = buildBrokerHandoff({ broker, signal, intent });
  if (brokerHandoff?.url) {
    intent.brokerHandoffUrl = brokerHandoff.url;
    intent.brokerHandoffKind = brokerHandoff.kind;
    intent.canOpenBroker = true;
    intent.handoffPrefillsTicket = brokerHandoff.kind === 'prefilled_ticket';
  }

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

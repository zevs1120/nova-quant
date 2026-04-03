/** Human-readable labels for signal detail UI (Today / SignalDetail). */

export function humanizeSignalToken(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '--') return '--';
  return raw
    .replace(/^signals?\./i, '')
    .replace(/^validity\./i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatSignalDetailTimestamp(value, locale) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(locale || undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function humanSignalAssetLabel(signal, isZh) {
  if (signal.asset_class === 'OPTIONS') return isZh ? '期权' : 'Options';
  if (signal.asset_class === 'US_STOCK') return isZh ? '美股' : 'US stocks';
  if (signal.market === 'US') return isZh ? '美股' : 'US stocks';
  return isZh ? '加密货币' : 'Crypto';
}

export function humanSignalDirectionLabel(direction, isZh) {
  const key = String(direction || '').toUpperCase();
  if (key === 'LONG' || key === 'BUY') return isZh ? '做多' : 'Long';
  if (key === 'SHORT' || key === 'SELL') return isZh ? '做空' : 'Short';
  return humanizeSignalToken(key);
}

export function humanSignalStatusLabel(status, isZh) {
  const key = String(status || '').toUpperCase();
  if (key === 'NEW') return isZh ? '新机会' : 'New';
  if (key === 'WITHHELD') return isZh ? '先观察' : 'Watch first';
  if (key === 'EXPIRED') return isZh ? '已失效' : 'Expired';
  if (key === 'TRIGGERED') return isZh ? '已触发' : 'Triggered';
  return humanizeSignalToken(key);
}

export function humanSignalPositionSizeText(signal, isZh) {
  const raw = signal.position_pct ?? signal.position_size_pct;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return isZh ? `最多 ${Math.round(numeric)}% 仓位` : `Up to ${Math.round(numeric)}% size`;
  }
  return '--';
}

export function humanSignalValidityText(signal, isZh) {
  const raw = String(signal.validity || '').trim();
  if (!raw || raw === 'undefined') return isZh ? '直到条件失效' : 'Until conditions break';
  const key = raw.toUpperCase();
  if (key === 'INTRADAY') return isZh ? '仅限今天' : 'Today only';
  if (key === 'SWING') return isZh ? '可持有几天' : 'Multi-day';
  return humanizeSignalToken(raw);
}

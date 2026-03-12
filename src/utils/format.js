export function formatNumber(value, digits = 2, locale) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  return Number(value).toLocaleString(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : Math.min(digits, 2)
  });
}

export function formatPercent(value, digits = 1, signed = false) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  const n = Number(value) * 100;
  const prefix = signed && n > 0 ? '+' : '';
  return `${prefix}${n.toFixed(digits)}%`;
}

export function formatPnlPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  const n = Number(value);
  const prefix = n > 0 ? '+' : '';
  return `${prefix}${n.toFixed(2)}%`;
}

export function formatDateTime(iso, locale) {
  if (!iso) return '--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDate(iso, locale) {
  if (!iso) return '--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function confidenceBand(level) {
  if (level >= 5) return 'high';
  if (level >= 3) return 'medium';
  return 'low';
}

export function directionIcon(direction) {
  return direction === 'LONG' ? '↗' : '↘';
}

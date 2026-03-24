export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function sum(values) {
  return values.reduce((acc, value) => acc + Number(value || 0), 0);
}

export function mean(values) {
  if (!values.length) return 0;
  return sum(values) / values.length;
}

export function stdDev(values) {
  if (values.length < 2) return 0;
  const mu = mean(values);
  const variance = mean(values.map((value) => (value - mu) ** 2));
  return Math.sqrt(variance);
}

export function percentileRank(values, value) {
  if (!values.length) return 0;
  let count = 0;
  for (const item of values) {
    if (item <= value) count += 1;
  }
  return count / values.length;
}

export function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * clamp(q, 0, 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  const weight = pos - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function correlation(a, b) {
  const length = Math.min(a.length, b.length);
  if (length < 3) return 0;
  const xs = a.slice(-length);
  const ys = b.slice(-length);
  const muX = mean(xs);
  const muY = mean(ys);
  let numerator = 0;
  let sumX = 0;
  let sumY = 0;

  for (let i = 0; i < length; i += 1) {
    const dx = xs[i] - muX;
    const dy = ys[i] - muY;
    numerator += dx * dy;
    sumX += dx ** 2;
    sumY += dy ** 2;
  }

  const denom = Math.sqrt(sumX * sumY);
  if (!denom) return 0;
  return numerator / denom;
}

export function returnsFromPrices(prices) {
  if (!prices?.length) return [];
  const returns = [];
  for (let i = 1; i < prices.length; i += 1) {
    const prev = prices[i - 1];
    const current = prices[i];
    if (!prev) {
      returns.push(0);
      continue;
    }
    returns.push(current / prev - 1);
  }
  return returns;
}

export function maxDrawdownFromCurve(curve) {
  if (!curve?.length) return 0;
  let peak = curve[0];
  let maxDrawdown = 0;

  for (const point of curve) {
    peak = Math.max(peak, point);
    const drawdown = peak === 0 ? 0 : (point - peak) / peak;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
  }
  return Math.abs(maxDrawdown);
}

export function rollingStd(values, lookback, index) {
  const start = Math.max(0, index - lookback + 1);
  const slice = values.slice(start, index + 1);
  return stdDev(slice);
}

export function rollingMean(values, lookback, index) {
  const start = Math.max(0, index - lookback + 1);
  const slice = values.slice(start, index + 1);
  return mean(slice);
}

export function groupBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

export function compoundReturns(returns) {
  if (!returns.length) return 0;
  const equity = returns.reduce((acc, value) => acc * (1 + value), 1);
  return equity - 1;
}

export function deterministicHash(input) {
  const text = String(input);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

export function round(value, digits = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const scale = 10 ** digits;
  return Math.round(n * scale) / scale;
}

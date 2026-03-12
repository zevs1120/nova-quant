export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}

export function mean(values) {
  if (!values?.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

export function stdDev(values) {
  if (!values || values.length < 2) return 0;
  const mu = mean(values);
  const variance = mean(values.map((value) => (Number(value) - mu) ** 2));
  return Math.sqrt(variance);
}

export function percentileRank(values, value) {
  if (!values?.length) return 0;
  const hit = values.filter((item) => item <= value).length;
  return hit / values.length;
}

export function sum(values) {
  return (values || []).reduce((acc, value) => acc + Number(value || 0), 0);
}

export function simpleMovingAverage(values, period) {
  if (!values?.length) return 0;
  const size = Math.max(1, period);
  const slice = values.slice(-size);
  return mean(slice);
}

export function pctChange(prev, next) {
  if (!Number.isFinite(prev) || !Number.isFinite(next) || Number(prev) === 0) return 0;
  return Number(next) / Number(prev) - 1;
}

export function returnsFromPrices(prices) {
  if (!prices?.length) return [];
  const rows = [];
  for (let i = 1; i < prices.length; i += 1) {
    rows.push(pctChange(prices[i - 1], prices[i]));
  }
  return rows;
}

export function annualizedVolatility(returns, periodsPerYear = 252) {
  if (!returns?.length) return 0;
  return stdDev(returns) * Math.sqrt(periodsPerYear);
}

export function downsideVolatility(returns, periodsPerYear = 252) {
  if (!returns?.length) return 0;
  const negatives = returns.map((value) => (value < 0 ? value : 0));
  return stdDev(negatives) * Math.sqrt(periodsPerYear);
}

export function rollingZScore(values, period = 20) {
  if (!values?.length) return 0;
  const slice = values.slice(-Math.max(2, period));
  const latest = slice[slice.length - 1];
  const mu = mean(slice);
  const sigma = stdDev(slice) || 1e-9;
  return (latest - mu) / sigma;
}

export function maxDrawdownFromCurve(curve) {
  if (!curve?.length) return 0;
  let peak = curve[0];
  let worst = 0;
  for (const value of curve) {
    peak = Math.max(peak, value);
    const dd = peak === 0 ? 0 : (value - peak) / peak;
    worst = Math.min(worst, dd);
  }
  return Math.abs(worst);
}

export function computeRsi(closes, period = 14) {
  if (!closes?.length || closes.length < period + 1) return 50;
  const returns = returnsFromPrices(closes.slice(-(period + 1)));
  const gains = returns.map((value) => (value > 0 ? value : 0));
  const losses = returns.map((value) => (value < 0 ? Math.abs(value) : 0));
  const avgGain = mean(gains);
  const avgLoss = mean(losses);
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function deterministicNoise(seed, step) {
  const x = Math.sin((seed + step * 12.9898) * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export function hashCode(text) {
  const value = String(text);
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function rankMap(valuesByKey) {
  const entries = Object.entries(valuesByKey);
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const total = Math.max(1, sorted.length - 1);
  return Object.fromEntries(
    sorted.map(([key], index) => [
      key,
      total === 0 ? 1 : round(1 - index / total, 4)
    ])
  );
}

export function cumulativeFromReturns(monthlyReturns, start = 100) {
  const curve = [];
  let equity = start;
  for (const row of monthlyReturns) {
    equity *= 1 + Number(row.ret || 0);
    curve.push(round(equity, 4));
  }
  return curve;
}

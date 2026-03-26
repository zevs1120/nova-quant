import { clamp, round } from './math.js';
import { BIAS_RATE_THRESHOLDS } from './params.js';

const ACTIVE_STATUSES = new Set(['NEW', 'TRIGGERED']);
const US_THEME_BUCKETS = {
  mega_tech: new Set(['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'TSLA', 'GOOGL']),
  index_beta: new Set(['SPY', 'QQQ', 'IWM', 'DIA']),
};
const CRYPTO_BUCKET = new Set(['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'BNB-USDT']);

function stopDistancePct(signal) {
  const entryLow = Number(signal.entry_zone?.low ?? signal.entry_min ?? 0);
  const entryHigh = Number(signal.entry_zone?.high ?? signal.entry_max ?? 0);
  const entryMid = (entryLow + entryHigh) / 2;
  const stop = Number(
    signal.stop_loss?.price ?? signal.stop_loss_value ?? signal.stop_loss ?? entryMid,
  );
  if (!Number.isFinite(entryMid) || entryMid <= 0 || !Number.isFinite(stop)) return 0;
  return Math.abs((entryMid - stop) / entryMid) * 100;
}

function classifyTheme(signal) {
  const symbol = String(signal.symbol || '').toUpperCase();
  if (signal.asset_class === 'CRYPTO' || signal.market === 'CRYPTO') return 'crypto_core';
  for (const [theme, set] of Object.entries(US_THEME_BUCKETS)) {
    if (set.has(symbol)) return theme;
  }
  return 'single_name';
}

function buildCorrelationAlerts(activeSignals) {
  const themeMap = new Map();
  for (const signal of activeSignals) {
    const theme = classifyTheme(signal);
    const current = themeMap.get(theme) || { theme, count: 0, gross_pct: 0, symbols: [] };
    current.count += 1;
    current.gross_pct += Number(
      signal.position_advice?.position_pct ?? signal.position_size_pct ?? 0,
    );
    current.symbols.push(signal.symbol);
    themeMap.set(theme, current);
  }

  const alerts = [];
  for (const row of themeMap.values()) {
    const threshold = row.theme === 'crypto_core' ? 14 : row.theme === 'mega_tech' ? 10 : 18;
    if (row.count >= 2 && row.gross_pct >= threshold) {
      alerts.push({
        type: 'correlation_cluster',
        theme: row.theme,
        severity: row.gross_pct >= threshold * 1.4 ? 'HIGH' : 'MEDIUM',
        gross_pct: round(row.gross_pct, 2),
        symbols: row.symbols,
      });
    }
  }
  return alerts;
}

/**
 * Compute bias rate (乖离率) — how far entry price deviates from the trend.
 * Borrowed from DSA core rule: "乖离率 > 5% 不追高".
 *
 * Uses trend_strength as a proxy for MA alignment. When trend_strength is
 * high (e.g., 0.7), price is likely near its MAs. Larger entry/stop distance
 * with lower trend strength = higher bias rate.
 */
function computeBiasRate(signal) {
  const entryLow = Number(signal.entry_zone?.low ?? signal.entry_min ?? 0);
  const entryHigh = Number(signal.entry_zone?.high ?? signal.entry_max ?? 0);
  const entryMid = (entryLow + entryHigh) / 2;
  if (!Number.isFinite(entryMid) || entryMid <= 0) return 0;

  const stop = Number(
    signal.stop_loss?.price ?? signal.stop_loss_value ?? signal.stop_loss ?? entryMid,
  );
  // The distance from entry to stop as a % of entry is used as a lower-bound
  // proxy for how far the trade is extended from equilibrium.
  const rawDistance = Math.abs((entryMid - stop) / entryMid) * 100;

  // Scale by inverse of regime_compatibility to capture extension felt by
  // the current regime — a poorly-fitting regime amplifies the bias signal.
  const regimeCompat = Number(signal.regime_compatibility ?? 65);
  const regimeScaler = regimeCompat < 50 ? 1.3 : regimeCompat < 70 ? 1.0 : 0.85;

  return round(rawDistance * regimeScaler, 2);
}

function buildBiasRateWarnings(activeSignals) {
  const warnings = [];
  for (const signal of activeSignals) {
    const biasRate = computeBiasRate(signal);
    if (biasRate >= BIAS_RATE_THRESHOLDS.block_pct) {
      warnings.push({
        type: 'bias_rate_blocked',
        signal_id: signal.signal_id,
        symbol: signal.symbol,
        bias_rate_pct: biasRate,
        threshold_pct: BIAS_RATE_THRESHOLDS.block_pct,
        severity: 'HIGH',
      });
    } else if (biasRate >= BIAS_RATE_THRESHOLDS.warning_pct) {
      warnings.push({
        type: 'bias_rate_overextended',
        signal_id: signal.signal_id,
        symbol: signal.symbol,
        bias_rate_pct: biasRate,
        threshold_pct: BIAS_RATE_THRESHOLDS.warning_pct,
        severity: 'MEDIUM',
      });
    }
  }
  return warnings;
}

function buildRegimeMismatchWarnings(activeSignals) {
  return activeSignals
    .filter((signal) => Number(signal.regime_compatibility ?? 100) < 50)
    .map((signal) => ({
      type: 'regime_mismatch',
      signal_id: signal.signal_id,
      symbol: signal.symbol,
      regime_id: signal.regime_id,
      regime_compatibility: Number(signal.regime_compatibility ?? 0),
      severity: Number(signal.regime_compatibility ?? 0) < 36 ? 'HIGH' : 'MEDIUM',
    }));
}

function recommendation({
  riskState,
  budgetUsedPct,
  maxBudgetPct,
  correlationAlerts,
  mismatchWarnings,
  biasRateWarnings,
}) {
  if (!riskState?.status?.trading_on) {
    return {
      action: 'STAY_OUT',
      reason: 'Daily loss or drawdown guardrail reached.',
    };
  }

  // Bias-rate hard block: any signal exceeding block_pct → refuse new trades
  const hasBiasBlock = biasRateWarnings.some((w) => w.type === 'bias_rate_blocked');
  if (hasBiasBlock) {
    return {
      action: 'STAY_OUT',
      reason: 'Entry price deviates too far from equilibrium (乖离率 hard block).',
    };
  }

  const hardRisk = budgetUsedPct >= 95;
  const riskClusterHigh = correlationAlerts.some((item) => item.severity === 'HIGH');
  if (hardRisk || (riskClusterHigh && budgetUsedPct >= 80)) {
    return {
      action: 'STAY_OUT',
      reason: 'Portfolio risk budget is effectively exhausted or concentration risk is too high.',
    };
  }

  const warmRisk =
    budgetUsedPct >= 75 ||
    riskState?.bucket_state === 'DERISKED' ||
    mismatchWarnings.length >= 2 ||
    correlationAlerts.length >= 1 ||
    riskClusterHigh;
  if (warmRisk) {
    return {
      action: 'REDUCE',
      reason: 'Trade only top setups and reduce size due to elevated portfolio/regime risk.',
    };
  }

  return {
    action: 'TRADE_OK',
    reason: 'Risk budget and regime alignment support normal disciplined execution.',
  };
}

export function runRiskGuardrailEngine({ signals, riskState }) {
  const activeSignals = signals.filter((item) => ACTIVE_STATUSES.has(String(item.status)));
  const perSignalRisk = activeSignals.map((signal) => {
    const posPct = Number(signal.position_advice?.position_pct ?? signal.position_size_pct ?? 0);
    const stopPct = stopDistancePct(signal);
    const riskUsedPct = (posPct * Math.max(stopPct, 0.2)) / 100;
    return {
      signal_id: signal.signal_id,
      symbol: signal.symbol,
      pos_pct: posPct,
      stop_pct: stopPct,
      risk_used_pct: riskUsedPct,
    };
  });

  const usedRiskPct = round(
    perSignalRisk.reduce((sum, item) => sum + item.risk_used_pct, 0),
    4,
  );
  const maxBudgetPct = Number(riskState?.profile?.max_daily_loss_pct ?? 3);
  const budgetUsedPct = round(clamp((usedRiskPct / Math.max(maxBudgetPct, 0.1)) * 100, 0, 300), 2);
  const remainingPct = round(Math.max(0, maxBudgetPct - usedRiskPct), 4);

  const correlationAlerts = buildCorrelationAlerts(activeSignals);
  const regimeMismatchWarnings = buildRegimeMismatchWarnings(activeSignals);
  const biasRateWarnings = buildBiasRateWarnings(activeSignals);
  const rec = recommendation({
    riskState,
    budgetUsedPct,
    maxBudgetPct,
    correlationAlerts,
    mismatchWarnings: regimeMismatchWarnings,
    biasRateWarnings,
  });

  const signalAnnotations = Object.fromEntries(
    signals.map((signal) => {
      const warnings = [];
      if (regimeMismatchWarnings.some((item) => item.signal_id === signal.signal_id))
        warnings.push('regime_mismatch');
      if (correlationAlerts.some((item) => item.symbols.includes(signal.symbol)))
        warnings.push('correlation_cluster');
      const biasWarning = biasRateWarnings.find((item) => item.signal_id === signal.signal_id);
      if (biasWarning) warnings.push(biasWarning.type);
      return [
        signal.signal_id,
        {
          signal_id: signal.signal_id,
          warnings,
          recommendation: rec.action,
          bias_rate_pct: biasWarning?.bias_rate_pct ?? null,
        },
      ];
    }),
  );

  return {
    generated_at: new Date().toISOString(),
    user_risk_bucket: riskState?.bucket_state || 'BASE',
    portfolio_risk_budget: {
      max_risk_pct: maxBudgetPct,
      used_risk_pct: usedRiskPct,
      used_budget_pct: budgetUsedPct,
      remaining_risk_pct: remainingPct,
    },
    correlated_exposure_alerts: correlationAlerts,
    regime_mismatch_warnings: regimeMismatchWarnings,
    bias_rate_warnings: biasRateWarnings,
    stay_out_recommendation: rec,
    signal_annotations: signalAnnotations,
  };
}

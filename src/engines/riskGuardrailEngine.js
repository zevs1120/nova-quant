import { clamp, round } from './math.js';

const ACTIVE_STATUSES = new Set(['NEW', 'TRIGGERED']);
const US_THEME_BUCKETS = {
  mega_tech: new Set(['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'TSLA', 'GOOGL']),
  index_beta: new Set(['SPY', 'QQQ', 'IWM', 'DIA'])
};
const CRYPTO_BUCKET = new Set(['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'BNB-USDT']);

function stopDistancePct(signal) {
  const entryLow = Number(signal.entry_zone?.low ?? signal.entry_min ?? 0);
  const entryHigh = Number(signal.entry_zone?.high ?? signal.entry_max ?? 0);
  const entryMid = (entryLow + entryHigh) / 2;
  const stop = Number(signal.stop_loss?.price ?? signal.stop_loss_value ?? signal.stop_loss ?? entryMid);
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
    current.gross_pct += Number(signal.position_advice?.position_pct ?? signal.position_size_pct ?? 0);
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
        symbols: row.symbols
      });
    }
  }
  return alerts;
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
      severity: Number(signal.regime_compatibility ?? 0) < 36 ? 'HIGH' : 'MEDIUM'
    }));
}

function recommendation({ riskState, budgetUsedPct, maxBudgetPct, correlationAlerts, mismatchWarnings }) {
  if (!riskState?.status?.trading_on) {
    return {
      action: 'STAY_OUT',
      reason: 'Daily loss or drawdown guardrail reached.'
    };
  }

  const hardRisk = budgetUsedPct >= 95;
  const riskClusterHigh = correlationAlerts.some((item) => item.severity === 'HIGH');
  if (hardRisk || (riskClusterHigh && budgetUsedPct >= 80)) {
    return {
      action: 'STAY_OUT',
      reason: 'Portfolio risk budget is effectively exhausted or concentration risk is too high.'
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
      reason: 'Trade only top setups and reduce size due to elevated portfolio/regime risk.'
    };
  }

  return {
    action: 'TRADE_OK',
    reason: 'Risk budget and regime alignment support normal disciplined execution.'
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
      risk_used_pct: riskUsedPct
    };
  });

  const usedRiskPct = round(perSignalRisk.reduce((sum, item) => sum + item.risk_used_pct, 0), 4);
  const maxBudgetPct = Number(riskState?.profile?.max_daily_loss_pct ?? 3);
  const budgetUsedPct = round(clamp((usedRiskPct / Math.max(maxBudgetPct, 0.1)) * 100, 0, 300), 2);
  const remainingPct = round(Math.max(0, maxBudgetPct - usedRiskPct), 4);

  const correlationAlerts = buildCorrelationAlerts(activeSignals);
  const regimeMismatchWarnings = buildRegimeMismatchWarnings(activeSignals);
  const rec = recommendation({
    riskState,
    budgetUsedPct,
    maxBudgetPct,
    correlationAlerts,
    mismatchWarnings: regimeMismatchWarnings
  });

  const signalAnnotations = Object.fromEntries(
    signals.map((signal) => {
      const warnings = [];
      if (regimeMismatchWarnings.some((item) => item.signal_id === signal.signal_id)) warnings.push('regime_mismatch');
      if (correlationAlerts.some((item) => item.symbols.includes(signal.symbol))) warnings.push('correlation_cluster');
      return [
        signal.signal_id,
        {
          signal_id: signal.signal_id,
          warnings,
          recommendation: rec.action
        }
      ];
    })
  );

  return {
    generated_at: new Date().toISOString(),
    user_risk_bucket: riskState?.bucket_state || 'BASE',
    portfolio_risk_budget: {
      max_risk_pct: maxBudgetPct,
      used_risk_pct: usedRiskPct,
      used_budget_pct: budgetUsedPct,
      remaining_risk_pct: remainingPct
    },
    correlated_exposure_alerts: correlationAlerts,
    regime_mismatch_warnings: regimeMismatchWarnings,
    stay_out_recommendation: rec,
    signal_annotations: signalAnnotations
  };
}

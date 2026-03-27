import type {
  ExecutionRecord,
  MarketStateRecord,
  SignalContract,
  UserHoldingInput,
  UserRiskProfileRecord,
} from '../types.js';

const MODE_RANK = Object.freeze({
  NORMAL: 0,
  CAUTION: 1,
  DERISK: 2,
  BLOCKED: 3,
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function max(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((best, value) => (value > best ? value : best), values[0] || 0);
}

function safeNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeDirection(value: unknown): 'LONG' | 'SHORT' {
  return String(value || '')
    .trim()
    .toUpperCase() === 'SHORT'
    ? 'SHORT'
    : 'LONG';
}

function normalizeMarket(value: unknown, assetClass?: string): 'US' | 'CRYPTO' {
  const market = String(value || '')
    .trim()
    .toUpperCase();
  if (market === 'CRYPTO') return 'CRYPTO';
  return String(assetClass || '')
    .trim()
    .toUpperCase() === 'CRYPTO'
    ? 'CRYPTO'
    : 'US';
}

function upgradeMode(
  current: RiskGovernorOutcome['governor_mode'],
  next: RiskGovernorOutcome['governor_mode'],
): RiskGovernorOutcome['governor_mode'] {
  return MODE_RANK[next] > MODE_RANK[current] ? next : current;
}

function normalizeHolding(row: UserHoldingInput) {
  const assetClass = String(row.asset_class || '').toUpperCase();
  const holdingExtras = row as unknown as Record<string, unknown>;
  return {
    symbol: String(row.symbol || '')
      .trim()
      .toUpperCase(),
    sector: String(row.sector || '').trim() || 'Unknown',
    weightPct: Number(row.weight_pct || 0),
    assetClass,
    market: normalizeMarket(holdingExtras.market, assetClass),
    direction: normalizeDirection(holdingExtras.direction),
  };
}

function signalEntryMid(signal: SignalContract & Record<string, unknown>) {
  const entryLow = safeNumber(signal.entry_zone?.low ?? signal.entry_min, NaN);
  const entryHigh = safeNumber(signal.entry_zone?.high ?? signal.entry_max, NaN);
  if (Number.isFinite(entryLow) && Number.isFinite(entryHigh) && entryLow > 0 && entryHigh > 0) {
    return (entryLow + entryHigh) / 2;
  }
  return safeNumber(signal.entry_price, NaN);
}

function signalStopPrice(signal: SignalContract & Record<string, unknown>) {
  return safeNumber(signal.stop_loss?.price ?? signal.stop_loss_value ?? signal.stop_loss, NaN);
}

function signalPositionPct(signal: SignalContract & Record<string, unknown>) {
  return safeNumber(
    signal.position_advice?.position_pct ?? signal.position_pct ?? signal.position_size_pct,
    0,
  );
}

function stopDistancePct(signal: SignalContract & Record<string, unknown>) {
  const entryMid = signalEntryMid(signal);
  const stop = signalStopPrice(signal);
  if (!Number.isFinite(entryMid) || entryMid <= 0 || !Number.isFinite(stop) || stop <= 0) return 0;
  return Math.abs((entryMid - stop) / entryMid) * 100;
}

function executionTimestamp(row: ExecutionRecord, nowMs: number) {
  const created = safeNumber(row.created_at_ms, NaN);
  if (Number.isFinite(created) && created > 0) return created;
  const updated = safeNumber(row.updated_at_ms, NaN);
  if (Number.isFinite(updated) && updated > 0) return updated;
  return nowMs;
}

function recentExecutionRows(executions: ExecutionRecord[] = [], nowMs: number) {
  return executions
    .filter((row) => row.action === 'DONE' || row.action === 'CLOSE')
    .slice()
    .sort((a, b) => executionTimestamp(b, nowMs) - executionTimestamp(a, nowMs));
}

function rollingPnLPct(executions: ExecutionRecord[], nowMs: number, windowMs: number) {
  return round(
    executions
      .filter((row) => nowMs - executionTimestamp(row, nowMs) <= windowMs)
      .reduce((sum, row) => sum + safeNumber(row.pnl_pct, 0), 0),
    4,
  );
}

function consecutiveLossCount(executions: ExecutionRecord[]) {
  let streak = 0;
  for (const row of executions) {
    const pnl = safeNumber(row.pnl_pct, 0);
    if (pnl < 0) {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
}

function drawdownStats(executions: ExecutionRecord[] = [], nowMs: number) {
  const ordered = executions
    .slice()
    .sort((a, b) => executionTimestamp(a, nowMs) - executionTimestamp(b, nowMs));
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const row of ordered) {
    equity *= 1 + safeNumber(row.pnl_pct, 0) / 100;
    peak = Math.max(peak, equity);
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    maxDrawdown = Math.max(maxDrawdown, dd);
  }
  const currentDrawdown = peak > 0 ? (peak - equity) / peak : 0;
  return {
    current_drawdown_pct: round(currentDrawdown * 100, 4),
    max_drawdown_pct: round(maxDrawdown * 100, 4),
    realized_equity_multiple: round(equity, 6),
  };
}

function inferSectorForSignal(
  holdings: ReturnType<typeof normalizeHolding>[],
  signal: SignalContract & Record<string, unknown>,
) {
  const symbol = String(signal.symbol || '')
    .trim()
    .toUpperCase();
  const holdingMatch = holdings.find((row) => row.symbol === symbol)?.sector;
  const signalSector = String(signal.sector || signal.theme || '').trim();
  return holdingMatch || signalSector || 'Unknown';
}

function buildBudgetModel(args: {
  riskProfile: UserRiskProfileRecord | null;
  market: 'US' | 'CRYPTO';
}) {
  const key = String(args.riskProfile?.profile_key || 'balanced').toLowerCase();
  const exposureCap = clamp(safeNumber(args.riskProfile?.exposure_cap, 55), 18, 100);
  const dailyLoss = clamp(safeNumber(args.riskProfile?.max_daily_loss, 3), 0.8, 6);
  const singleTradeRisk = clamp(safeNumber(args.riskProfile?.max_loss_per_trade, 1), 0.25, 2.5);
  const hardDrawdown = clamp(
    Math.min(safeNumber(args.riskProfile?.max_drawdown, key === 'conservative' ? 6 : 10), 10),
    4,
    10,
  );

  const positionCapPct =
    key === 'conservative'
      ? 6
      : key === 'aggressive'
        ? args.market === 'CRYPTO'
          ? 10
          : 9
        : args.market === 'CRYPTO'
          ? 8.5
          : 8;

  const sameDirectionCapPct =
    key === 'conservative' ? 24 : key === 'aggressive' ? 46 : args.market === 'CRYPTO' ? 42 : 40;
  const sameSymbolTaperPct = key === 'conservative' ? 8 : key === 'aggressive' ? 12 : 10;
  const sameSymbolCapPct = key === 'conservative' ? 14 : key === 'aggressive' ? 20 : 18;
  const sectorCapPct = key === 'conservative' ? 24 : key === 'aggressive' ? 34 : 30;
  const marketCapPct = round(Math.min(exposureCap, exposureCap * 0.95), 2);
  const assetClassCapPct =
    key === 'conservative' ? 22 : key === 'aggressive' ? 40 : args.market === 'CRYPTO' ? 36 : 34;
  const weeklyLossLimitPct = round(Math.min(hardDrawdown * 0.75, dailyLoss * 1.9), 2);
  const monthlyLossLimitPct = round(Math.min(hardDrawdown, dailyLoss * 3.1), 2);

  return {
    exposure_cap_pct: exposureCap,
    single_trade_risk_cap_pct: singleTradeRisk,
    position_cap_pct: positionCapPct,
    same_symbol_taper_pct: sameSymbolTaperPct,
    same_symbol_cap_pct: sameSymbolCapPct,
    sector_cap_pct: sectorCapPct,
    market_cap_pct: marketCapPct,
    asset_class_cap_pct: assetClassCapPct,
    same_direction_cap_pct: sameDirectionCapPct,
    daily_loss_limit_pct: dailyLoss,
    weekly_loss_limit_pct: weeklyLossLimitPct,
    monthly_loss_limit_pct: monthlyLossLimitPct,
    drawdown_caution_pct: round(Math.max(2.5, hardDrawdown * 0.5), 2),
    drawdown_derisk_pct: round(Math.max(4, hardDrawdown * 0.75), 2),
    drawdown_hard_stop_pct: round(Math.max(5, hardDrawdown * 0.9), 2),
    loss_streak_caution_count: 2,
    loss_streak_derisk_count: 3,
    loss_streak_block_count: 4,
    volatility_caution_percentile: 72,
    volatility_derisk_percentile: 82,
    volatility_black_swan_percentile: 94,
    risk_off_caution_threshold: 0.58,
    risk_off_derisk_threshold: 0.68,
    risk_off_black_swan_threshold: 0.78,
    suggested_time_stop_bars: args.market === 'CRYPTO' ? 18 : 12,
  };
}

export type RiskGovernorOutcome = {
  governor_mode: 'NORMAL' | 'CAUTION' | 'DERISK' | 'BLOCKED';
  allowed: boolean;
  size_multiplier: number;
  risk_budget_remaining: number;
  block_reason: string | null;
  reasons: string[];
  overlays: string[];
  current_drawdown_pct: number;
  proposed_trade_risk_pct: number;
  exposure_snapshot: {
    total_exposure_pct: number;
    same_symbol_pct: number;
    sector_exposure_pct: number;
    market_exposure_pct: number;
    asset_class_exposure_pct: number;
    same_direction_exposure_pct: number;
  };
  realized_loss_windows: {
    day_pct: number;
    week_pct: number;
    month_pct: number;
    recent_realized_pnl_pct: number;
    consecutive_losses: number;
    max_realized_drawdown_pct: number;
  };
  risk_budget_model: Record<string, number>;
  execution_controls: {
    position_cap_pct: number;
    suggested_time_stop_bars: number;
    volatility_stop_pct: number;
  };
};

export function evaluateRiskGovernor(args: {
  signal: SignalContract & Record<string, unknown>;
  marketState: MarketStateRecord[];
  executions?: ExecutionRecord[];
  holdings?: UserHoldingInput[];
  riskProfile: UserRiskProfileRecord | null;
  calibratedConfidence?: number | null;
}): RiskGovernorOutcome {
  const nowMs = Date.now();
  const rows = (args.holdings || []).map(normalizeHolding).filter((row) => row.symbol);
  const signalSymbol = String(args.signal.symbol || '')
    .trim()
    .toUpperCase();
  const signalAssetClass =
    String(args.signal.asset_class || '')
      .trim()
      .toUpperCase() || 'US_STOCK';
  const signalMarket = normalizeMarket(args.signal.market, signalAssetClass);
  const signalDirection = normalizeDirection(args.signal.direction);
  const signalSector = inferSectorForSignal(rows, args.signal);
  const budgetModel = buildBudgetModel({
    riskProfile: args.riskProfile,
    market: signalMarket,
  });

  const totalExposure = rows.reduce((sum, row) => sum + row.weightPct, 0);
  const sameSymbol = rows.find((row) => row.symbol === signalSymbol)?.weightPct || 0;
  const sectorMap = new Map<string, number>();
  const marketMap = new Map<string, number>();
  const assetClassMap = new Map<string, number>();
  const directionMap = new Map<string, number>();
  for (const row of rows) {
    sectorMap.set(row.sector, (sectorMap.get(row.sector) || 0) + row.weightPct);
    marketMap.set(row.market, (marketMap.get(row.market) || 0) + row.weightPct);
    assetClassMap.set(row.assetClass, (assetClassMap.get(row.assetClass) || 0) + row.weightPct);
    directionMap.set(row.direction, (directionMap.get(row.direction) || 0) + row.weightPct);
  }
  const sectorExposure = sectorMap.get(signalSector) || 0;
  const marketExposure = marketMap.get(signalMarket) || 0;
  const assetClassExposure = assetClassMap.get(signalAssetClass) || 0;
  const sameDirectionExposure = directionMap.get(signalDirection) || 0;
  const exposureCap = budgetModel.exposure_cap_pct;
  const riskBudgetRemaining = round(Math.max(0, exposureCap - totalExposure), 2);

  const recentExecutions = recentExecutionRows(args.executions || [], nowMs).slice(0, 20);
  const streakLossCount = consecutiveLossCount(recentExecutions);
  const recentPnL = round(
    recentExecutions.slice(0, 8).reduce((sum, row) => sum + safeNumber(row.pnl_pct, 0), 0),
    4,
  );
  const dailyPnL = rollingPnLPct(recentExecutions, nowMs, 86400000);
  const weeklyPnL = rollingPnLPct(recentExecutions, nowMs, 7 * 86400000);
  const monthlyPnL = rollingPnLPct(recentExecutions, nowMs, 30 * 86400000);
  const realizedDrawdown = drawdownStats(recentExecutions, nowMs);

  const avgRiskOff = args.marketState.length
    ? mean(args.marketState.map((row) => safeNumber(row.risk_off_score, 0)))
    : 0;
  const avgVol = args.marketState.length
    ? mean(args.marketState.map((row) => safeNumber(row.volatility_percentile, 0)))
    : 0;
  const maxRiskOff = args.marketState.length
    ? max(args.marketState.map((row) => safeNumber(row.risk_off_score, 0)))
    : 0;
  const maxVol = args.marketState.length
    ? max(args.marketState.map((row) => safeNumber(row.volatility_percentile, 0)))
    : 0;
  const minTrend = args.marketState.length
    ? args.marketState.reduce(
        (lowest, row) => Math.min(lowest, safeNumber(row.trend_strength, 1)),
        safeNumber(args.marketState[0]?.trend_strength, 1),
      )
    : 1;

  const requestedPositionPct = signalPositionPct(args.signal);
  const stopDistance = stopDistancePct(args.signal);
  const proposedTradeRiskPct = round((requestedPositionPct * stopDistance) / 100, 4);
  const volatilityStopPct = round(
    Math.max(stopDistance || 0, signalMarket === 'CRYPTO' ? 3.8 : 2.4),
    2,
  );

  let governorMode: RiskGovernorOutcome['governor_mode'] = 'NORMAL';
  let allowed = true;
  let sizeMultiplier = 1;
  const reasons: string[] = [];
  const overlays: string[] = [];

  const block = (reason: string, overlay: string) => {
    governorMode = 'BLOCKED';
    allowed = false;
    sizeMultiplier = 0;
    reasons.push(reason);
    overlays.push(overlay);
  };

  const addOverlay = (
    nextMode: RiskGovernorOutcome['governor_mode'],
    multiplier: number,
    reason: string,
    overlay: string,
  ) => {
    governorMode = upgradeMode(governorMode, nextMode);
    sizeMultiplier *= multiplier;
    reasons.push(reason);
    overlays.push(overlay);
  };

  const blackSwanTriggered =
    (avgRiskOff >= 0.72 && avgVol >= 88) ||
    (maxRiskOff >= 0.82 && maxVol >= budgetModel.volatility_black_swan_percentile) ||
    (maxVol >= 97 && minTrend <= 0.32);

  if (blackSwanTriggered) {
    block(
      'Black-swan regime detected; new risk is disabled until stress normalizes.',
      'black_swan_kill_switch',
    );
  } else if (avgRiskOff >= budgetModel.risk_off_black_swan_threshold) {
    block('Market-wide risk-off pressure is too high for new risk.', 'risk_off_kill_switch');
  } else if (
    avgRiskOff >= budgetModel.risk_off_derisk_threshold ||
    avgVol >= budgetModel.volatility_derisk_percentile
  ) {
    addOverlay(
      'DERISK',
      0.5,
      'Volatility / risk-off conditions require smaller gross adds.',
      'macro_derisk',
    );
  } else if (
    avgRiskOff >= budgetModel.risk_off_caution_threshold ||
    avgVol >= budgetModel.volatility_caution_percentile
  ) {
    addOverlay(
      'CAUTION',
      0.74,
      'Conditions allow only selective, reduced-size exposure.',
      'caution_size_cut',
    );
  }

  const signalVolatility = safeNumber(args.signal.volatility_percentile, NaN);
  if (Number.isFinite(signalVolatility) && signalVolatility >= 68 && allowed) {
    const volTargetMultiplier = clamp(1 - (signalVolatility - 68) * 0.01, 0.45, 1);
    if (volTargetMultiplier < 0.999) {
      addOverlay(
        signalVolatility >= 82 ? 'DERISK' : 'CAUTION',
        volTargetMultiplier,
        'Signal volatility is elevated; apply volatility-targeted sizing.',
        'volatility_targeting',
      );
    }
  }

  if (riskBudgetRemaining <= 0.5) {
    block('Portfolio risk budget is exhausted.', 'budget_exhausted');
  } else if (riskBudgetRemaining <= 5) {
    addOverlay('DERISK', 0.55, 'Remaining portfolio risk budget is thin.', 'budget_thin');
  }

  if (sameSymbol >= budgetModel.same_symbol_cap_pct) {
    block('Existing same-symbol exposure is already too large.', 'same_symbol_block');
  } else if (sameSymbol >= budgetModel.same_symbol_taper_pct) {
    addOverlay(
      'CAUTION',
      0.7,
      'Existing same-symbol exposure requires a smaller add.',
      'same_symbol_taper',
    );
  }

  if (sectorExposure >= budgetModel.sector_cap_pct) {
    addOverlay('DERISK', 0.58, 'Sector concentration is already elevated.', 'sector_concentration');
  } else if (sectorExposure >= budgetModel.sector_cap_pct * 0.8) {
    addOverlay(
      'CAUTION',
      0.72,
      'Sector concentration is already elevated.',
      'sector_concentration',
    );
  }

  if (sameDirectionExposure >= budgetModel.same_direction_cap_pct) {
    block('Same-direction gross exposure is already at the portfolio cap.', 'same_direction_cap');
  } else if (sameDirectionExposure >= budgetModel.same_direction_cap_pct * 0.8) {
    addOverlay(
      'DERISK',
      0.68,
      'Same-direction exposure is elevated, so new adds must be smaller.',
      'same_direction_taper',
    );
  }

  if (marketExposure >= budgetModel.market_cap_pct) {
    addOverlay('DERISK', 0.62, 'Single-market concentration is elevated.', 'market_concentration');
  }

  if (assetClassExposure >= budgetModel.asset_class_cap_pct) {
    addOverlay(
      'DERISK',
      0.64,
      'Asset-class concentration is elevated and needs a smaller allocation.',
      'asset_class_concentration',
    );
  }

  if (dailyPnL <= -budgetModel.daily_loss_limit_pct) {
    block('Daily realized loss circuit breaker was triggered.', 'daily_loss_circuit');
    if (streakLossCount >= 2) {
      reasons.push('Recent realized losses triggered the recovery guard.');
      overlays.push('loss_streak_kill_switch');
    }
  } else if (dailyPnL <= -budgetModel.daily_loss_limit_pct * 0.75) {
    addOverlay(
      'DERISK',
      0.48,
      'Daily losses are close to the hard limit.',
      'daily_loss_near_limit',
    );
  }

  if (weeklyPnL <= -budgetModel.weekly_loss_limit_pct) {
    block('Weekly realized loss circuit breaker was triggered.', 'weekly_loss_circuit');
  } else if (weeklyPnL <= -budgetModel.weekly_loss_limit_pct * 0.8) {
    addOverlay(
      'DERISK',
      0.62,
      'Weekly losses require a broad de-risking posture.',
      'weekly_loss_near_limit',
    );
  }

  if (monthlyPnL <= -budgetModel.monthly_loss_limit_pct) {
    block('Monthly realized loss circuit breaker was triggered.', 'monthly_loss_circuit');
  } else if (monthlyPnL <= -budgetModel.monthly_loss_limit_pct * 0.8) {
    addOverlay(
      'DERISK',
      0.7,
      'Monthly losses are elevated; protect the equity curve before adding risk.',
      'monthly_loss_near_limit',
    );
  }

  if (realizedDrawdown.current_drawdown_pct >= budgetModel.drawdown_hard_stop_pct) {
    block('Equity drawdown hard stop is active; new risk is disabled.', 'drawdown_hard_stop');
  } else if (realizedDrawdown.current_drawdown_pct >= budgetModel.drawdown_derisk_pct) {
    addOverlay('DERISK', 0.42, 'Equity curve drawdown is in the de-risk zone.', 'drawdown_derisk');
  } else if (realizedDrawdown.current_drawdown_pct >= budgetModel.drawdown_caution_pct) {
    addOverlay(
      'CAUTION',
      0.68,
      'Equity curve is below peak and requires smaller sizing.',
      'drawdown_caution',
    );
  }

  if (streakLossCount >= budgetModel.loss_streak_block_count) {
    block('Recent realized losses triggered the recovery guard.', 'loss_streak_kill_switch');
  } else if (streakLossCount >= budgetModel.loss_streak_derisk_count) {
    addOverlay(
      'DERISK',
      0.52,
      'Consecutive losses triggered auto de-leveraging.',
      'loss_streak_derisk',
    );
  } else if (streakLossCount >= budgetModel.loss_streak_caution_count) {
    addOverlay('CAUTION', 0.78, 'Recent realized losses require recovery sizing.', 'loss_recovery');
  }

  if (requestedPositionPct > budgetModel.position_cap_pct && requestedPositionPct > 0) {
    addOverlay(
      requestedPositionPct >= budgetModel.position_cap_pct * 1.5 ? 'DERISK' : 'CAUTION',
      clamp(budgetModel.position_cap_pct / requestedPositionPct, 0.15, 1),
      'Requested size exceeds the per-position cap and must be reduced.',
      'position_cap_taper',
    );
  }

  if (proposedTradeRiskPct > budgetModel.single_trade_risk_cap_pct && proposedTradeRiskPct > 0) {
    addOverlay(
      proposedTradeRiskPct >= budgetModel.single_trade_risk_cap_pct * 1.4 ? 'DERISK' : 'CAUTION',
      clamp(budgetModel.single_trade_risk_cap_pct / proposedTradeRiskPct, 0.15, 1),
      'Single-trade risk exceeds the allowed risk budget.',
      'single_trade_risk_cap',
    );
  } else if (
    proposedTradeRiskPct >= budgetModel.single_trade_risk_cap_pct * 0.8 &&
    proposedTradeRiskPct > 0
  ) {
    addOverlay(
      'CAUTION',
      0.86,
      'Single-trade risk is close to the cap, so size is tapered.',
      'single_trade_risk_near_cap',
    );
  }

  if (
    recentPnL < 0 &&
    realizedDrawdown.current_drawdown_pct >= budgetModel.drawdown_caution_pct * 0.8
  ) {
    addOverlay(
      'CAUTION',
      0.82,
      'Equity curve protection is active while recent realized PnL remains negative.',
      'equity_curve_protection',
    );
  }

  if (String(args.signal.direction || '').toUpperCase() === 'SHORT') {
    sizeMultiplier *= 0.88;
    reasons.push('Short exposure stays slightly smaller until short-side calibration hardens.');
    overlays.push('short_asymmetry_haircut');
  }

  if (Number.isFinite(args.calibratedConfidence)) {
    const confidence = Number(args.calibratedConfidence);
    if (confidence < 0.52) {
      addOverlay(
        'DERISK',
        0.55,
        'Calibrated confidence is below normal deploy threshold.',
        'low_calibrated_confidence',
      );
    }
  }

  sizeMultiplier = allowed ? round(clamp(sizeMultiplier, 0.15, 1), 4) : 0;

  return {
    governor_mode: governorMode,
    allowed,
    size_multiplier: sizeMultiplier,
    risk_budget_remaining: riskBudgetRemaining,
    block_reason: allowed ? null : reasons[0] || 'Risk governor blocked the action.',
    reasons: [...new Set(reasons)],
    overlays: [...new Set(overlays)],
    current_drawdown_pct: realizedDrawdown.current_drawdown_pct,
    proposed_trade_risk_pct: proposedTradeRiskPct,
    exposure_snapshot: {
      total_exposure_pct: round(totalExposure, 4),
      same_symbol_pct: round(sameSymbol, 4),
      sector_exposure_pct: round(sectorExposure, 4),
      market_exposure_pct: round(marketExposure, 4),
      asset_class_exposure_pct: round(assetClassExposure, 4),
      same_direction_exposure_pct: round(sameDirectionExposure, 4),
    },
    realized_loss_windows: {
      day_pct: dailyPnL,
      week_pct: weeklyPnL,
      month_pct: monthlyPnL,
      recent_realized_pnl_pct: recentPnL,
      consecutive_losses: streakLossCount,
      max_realized_drawdown_pct: realizedDrawdown.max_drawdown_pct,
    },
    risk_budget_model: budgetModel,
    execution_controls: {
      position_cap_pct: budgetModel.position_cap_pct,
      suggested_time_stop_bars: budgetModel.suggested_time_stop_bars,
      volatility_stop_pct: volatilityStopPct,
    },
  };
}

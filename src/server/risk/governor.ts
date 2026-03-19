import type { ExecutionRecord, MarketStateRecord, SignalContract, UserHoldingInput, UserRiskProfileRecord } from '../types.js';

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

function normalizeHolding(row: UserHoldingInput) {
  return {
    symbol: String(row.symbol || '').trim().toUpperCase(),
    sector: String(row.sector || '').trim() || 'Unknown',
    weightPct: Number(row.weight_pct || 0),
    assetClass: String(row.asset_class || '').toUpperCase()
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
};

export function evaluateRiskGovernor(args: {
  signal: SignalContract & Record<string, unknown>;
  marketState: MarketStateRecord[];
  executions?: ExecutionRecord[];
  holdings?: UserHoldingInput[];
  riskProfile: UserRiskProfileRecord | null;
  calibratedConfidence?: number | null;
}): RiskGovernorOutcome {
  const rows = (args.holdings || []).map(normalizeHolding).filter((row) => row.symbol);
  const totalExposure = rows.reduce((sum, row) => sum + row.weightPct, 0);
  const sameSymbol = rows.find((row) => row.symbol === String(args.signal.symbol || '').toUpperCase())?.weightPct || 0;
  const sectorMap = new Map<string, number>();
  for (const row of rows) {
    sectorMap.set(row.sector, (sectorMap.get(row.sector) || 0) + row.weightPct);
  }
  const targetSector = rows.find((row) => row.symbol === String(args.signal.symbol || '').toUpperCase())?.sector || 'Unknown';
  const sectorExposure = sectorMap.get(targetSector) || 0;
  const exposureCap = Number(args.riskProfile?.exposure_cap || 55);
  const riskBudgetRemaining = round(Math.max(0, exposureCap - totalExposure), 2);

  const recentExecutions = (args.executions || [])
    .filter((row) => row.action === 'DONE' || row.action === 'CLOSE')
    .slice(0, 8);
  const recentLosses = recentExecutions.filter((row) => Number(row.pnl_pct || 0) < 0);
  const streakLossCount = recentLosses.length;
  const recentPnL = recentExecutions.reduce((sum, row) => sum + Number(row.pnl_pct || 0), 0);

  const avgRiskOff = args.marketState.length
    ? mean(args.marketState.map((row) => Number(row.risk_off_score || 0)))
    : 0;
  const avgVol = args.marketState.length
    ? mean(args.marketState.map((row) => Number(row.volatility_percentile || 0)))
    : 0;

  let governorMode: RiskGovernorOutcome['governor_mode'] = 'NORMAL';
  let allowed = true;
  let sizeMultiplier = 1;
  const reasons: string[] = [];
  const overlays: string[] = [];

  if (avgRiskOff >= 0.78) {
    governorMode = 'BLOCKED';
    allowed = false;
    sizeMultiplier = 0;
    reasons.push('Market-wide risk-off pressure is too high for new risk.');
    overlays.push('risk_off_kill_switch');
  } else if (avgRiskOff >= 0.68 || avgVol >= 82) {
    governorMode = 'DERISK';
    sizeMultiplier *= 0.5;
    reasons.push('Volatility / risk-off conditions require smaller gross adds.');
    overlays.push('macro_derisk');
  } else if (avgRiskOff >= 0.58 || avgVol >= 72) {
    governorMode = 'CAUTION';
    sizeMultiplier *= 0.74;
    reasons.push('Conditions allow only selective, reduced-size exposure.');
    overlays.push('caution_size_cut');
  }

  if (riskBudgetRemaining <= 0.5) {
    governorMode = 'BLOCKED';
    allowed = false;
    sizeMultiplier = 0;
    reasons.push('Portfolio risk budget is exhausted.');
    overlays.push('budget_exhausted');
  } else if (riskBudgetRemaining <= 5) {
    governorMode = governorMode === 'BLOCKED' ? 'BLOCKED' : 'DERISK';
    sizeMultiplier *= 0.55;
    reasons.push('Remaining portfolio risk budget is thin.');
    overlays.push('budget_thin');
  }

  if (sameSymbol >= 18) {
    governorMode = 'BLOCKED';
    allowed = false;
    sizeMultiplier = 0;
    reasons.push('Existing same-symbol exposure is already too large.');
    overlays.push('same_symbol_block');
  } else if (sameSymbol >= 10) {
    governorMode = governorMode === 'NORMAL' ? 'CAUTION' : governorMode;
    sizeMultiplier *= 0.7;
    reasons.push('Existing same-symbol exposure requires a smaller add.');
    overlays.push('same_symbol_taper');
  }

  if (sectorExposure >= 35) {
    governorMode = governorMode === 'NORMAL' ? 'CAUTION' : governorMode;
    sizeMultiplier *= 0.72;
    reasons.push('Sector concentration is already elevated.');
    overlays.push('sector_concentration');
  }

  if (streakLossCount >= 4 || recentPnL <= -Number(args.riskProfile?.max_daily_loss || 3)) {
    governorMode = 'BLOCKED';
    allowed = false;
    sizeMultiplier = 0;
    reasons.push('Recent realized losses triggered the recovery guard.');
    overlays.push('loss_streak_kill_switch');
  } else if (streakLossCount >= 2) {
    governorMode = governorMode === 'NORMAL' ? 'CAUTION' : governorMode;
    sizeMultiplier *= 0.78;
    reasons.push('Recent realized losses require recovery sizing.');
    overlays.push('loss_recovery');
  }

  if (String(args.signal.direction || '').toUpperCase() === 'SHORT') {
    sizeMultiplier *= 0.88;
    reasons.push('Short exposure stays slightly smaller until short-side calibration hardens.');
    overlays.push('short_asymmetry_haircut');
  }

  if (Number.isFinite(args.calibratedConfidence)) {
    const confidence = Number(args.calibratedConfidence);
    if (confidence < 0.52) {
      governorMode = governorMode === 'BLOCKED' ? 'BLOCKED' : 'DERISK';
      sizeMultiplier *= 0.55;
      reasons.push('Calibrated confidence is below normal deploy threshold.');
      overlays.push('low_calibrated_confidence');
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
    overlays: [...new Set(overlays)]
  };
}

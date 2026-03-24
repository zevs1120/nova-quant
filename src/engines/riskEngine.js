import {
  DEFAULT_RISK_PROFILE,
  DYNAMIC_RISK_BUCKETS,
  PARAM_VERSION,
  RISK_PROFILES,
  VELOCITY_SETTINGS,
} from './params.js';
import { clamp, round } from './math.js';

function latest(values) {
  if (!values?.length) return 0;
  return values[values.length - 1];
}

function asPercentile(value) {
  if (!Number.isFinite(value)) return 0;
  return value > 1 ? value / 100 : value;
}

function chooseBucket({ velocitySeries, volSeries }) {
  const currentVel = asPercentile(latest(velocitySeries));
  const currentVol = asPercentile(latest(volSeries));
  const prevVel = asPercentile(velocitySeries?.[velocitySeries.length - 2]);
  const prevVol = asPercentile(volSeries?.[volSeries.length - 2]);
  const prev2Vel = asPercentile(velocitySeries?.[velocitySeries.length - 3]);
  const prev2Vol = asPercentile(volSeries?.[volSeries.length - 3]);

  if (
    currentVel > VELOCITY_SETTINGS.restore_threshold ||
    currentVol > VELOCITY_SETTINGS.restore_threshold
  ) {
    return { state: 'DERISKED', reason: 'velocity/volatility percentile above 90th threshold' };
  }
  if (
    prevVel > VELOCITY_SETTINGS.restore_threshold ||
    prevVol > VELOCITY_SETTINGS.restore_threshold
  ) {
    return { state: 'RECOVERY_STEP_1', reason: 'first normalization step after de-risk trigger' };
  }
  if (
    prev2Vel > VELOCITY_SETTINGS.restore_threshold ||
    prev2Vol > VELOCITY_SETTINGS.restore_threshold
  ) {
    return { state: 'RECOVERY_STEP_2', reason: 'second normalization step before base risk' };
  }
  return { state: 'BASE', reason: 'normal risk bucket' };
}

function computeTradeHistoryRisk(trades = [], profile) {
  if (!trades.length) {
    return { trading_on: true, max_dd_pct: 0, daily_pnl_pct: 0 };
  }

  const ordered = [...trades].sort((a, b) => new Date(a.time_out) - new Date(b.time_out));
  let equity = 1;
  let peak = 1;
  let maxDd = 0;

  for (const trade of ordered) {
    const rSource =
      Number.isFinite(Number(trade.risk_pnl_pct)) && Number(trade.risk_pnl_pct) !== 0
        ? Number(trade.risk_pnl_pct)
        : Number(trade.pnl_pct || 0);
    const r = rSource / 100;
    equity *= 1 + r;
    peak = Math.max(peak, equity);
    const dd = peak === 0 ? 0 : (equity - peak) / peak;
    maxDd = Math.min(maxDd, dd);
  }

  const latestTrade = ordered[ordered.length - 1];
  const latestDay = latestTrade.time_out?.slice(0, 10);
  const dailyPnlPct = ordered
    .filter((trade) => trade.time_out?.startsWith(latestDay))
    .reduce((acc, trade) => {
      const rSource =
        Number.isFinite(Number(trade.risk_pnl_pct)) && Number(trade.risk_pnl_pct) !== 0
          ? Number(trade.risk_pnl_pct)
          : Number(trade.pnl_pct || 0);
      return acc + rSource;
    }, 0);

  const maxDdPct = Math.abs(maxDd) * 100;
  const tradingOn =
    dailyPnlPct > -profile.max_daily_loss_pct && maxDdPct < profile.max_drawdown_pct;

  return {
    trading_on: tradingOn,
    max_dd_pct: round(maxDdPct, 2),
    daily_pnl_pct: round(dailyPnlPct, 2),
  };
}

function riskLevelFromState(bucketState, riskOffScore) {
  if (bucketState === 'DERISKED' || riskOffScore >= 0.7) return 'HIGH';
  if (bucketState === 'BASE' && riskOffScore < 0.45) return 'LOW';
  return 'MEDIUM';
}

export function resolveRiskProfile(config = {}) {
  const requested =
    config.risk_profile ||
    config.risk_profile_key ||
    config.risk_rules?.profile ||
    DEFAULT_RISK_PROFILE;
  return RISK_PROFILES[requested] ? requested : DEFAULT_RISK_PROFILE;
}

export function computePositionPct({
  entry,
  stopLoss,
  profile,
  bucketMultiplier,
  activeSignalCount = 1,
}) {
  const safeEntry = Math.max(Number(entry || 0), 1e-6);
  const safeStop = Number(stopLoss || safeEntry);
  const stopDistancePct = (Math.abs(safeEntry - safeStop) / safeEntry) * 100;
  const riskPerTradePct = profile.max_loss_per_trade_pct;
  const rawPct = (riskPerTradePct / Math.max(stopDistancePct, 0.35)) * 100;
  const leverageScale = 0.8 + profile.leverage_cap * 0.2;
  const basePerSignalCap = Math.min(
    profile.exposure_cap_pct / Math.max(activeSignalCount, 1),
    profile.per_signal_cap_pct * leverageScale,
  );
  const perSignalCap = basePerSignalCap * bucketMultiplier;
  const positionPct = clamp(rawPct * bucketMultiplier, 0, perSignalCap);
  return round(positionPct, 2);
}

export function runRiskEngine({ config, trades, velocityState, regimeState }) {
  const profileKey = resolveRiskProfile(config);
  const profile = RISK_PROFILES[profileKey];
  const primarySeries = velocityState.series_index?.[velocityState.primary_key];
  const bucket = chooseBucket({
    velocitySeries: primarySeries?.velocity?.percentile || [velocityState.global.percentile || 0.5],
    volSeries: primarySeries?.velocity?.vol_percentile || [
      regimeState.primary?.vol_percentile || 0.5,
    ],
  });
  const bucketConfig = DYNAMIC_RISK_BUCKETS[bucket.state];
  const historyRisk = computeTradeHistoryRisk(trades, profile);
  const currentLevel = riskLevelFromState(bucket.state, regimeState.primary?.risk_off_score || 0.5);
  const nowIso = velocityState.generated_at;

  return {
    version: PARAM_VERSION,
    profile_key: profileKey,
    profile,
    bucket_state: bucket.state,
    bucket_multiplier: bucketConfig.multiplier,
    reason: bucket.reason,
    rules: {
      per_trade_risk_pct: profile.max_loss_per_trade_pct,
      daily_loss_pct: profile.max_daily_loss_pct,
      max_dd_pct: profile.max_drawdown_pct,
      exposure_cap_pct: profile.exposure_cap_pct,
      leverage_cap: profile.leverage_cap,
      vol_switch: true,
    },
    status: {
      trading_on: historyRisk.trading_on,
      current_level: currentLevel,
      current_risk_bucket: bucket.state,
      bucket_state: bucket.state,
      last_event: `${nowIso}: ${bucket.state} (${bucket.reason})`,
      last_event_en: `${nowIso}: ${bucket.state} (${bucket.reason})`,
      last_event_zh: `${nowIso}：${bucket.state}（${bucket.reason}）`,
      diagnostics: historyRisk,
    },
  };
}

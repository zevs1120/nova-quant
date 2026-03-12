import { round } from '../../engines/math.js';

const ACTIVE_STATUS = new Set(['NEW', 'TRIGGERED']);

function emptyCounter() {
  return {
    universe: 0,
    prefilter_passed: 0,
    generated: 0,
    regime_filter_passed: 0,
    score_threshold_passed: 0,
    risk_filter_passed: 0,
    conflict_filter_passed: 0,
    regime_filtered: 0,
    score_filtered: 0,
    risk_filtered: 0,
    conflict_filtered: 0,
    executable: 0,
    entered_positions: 0,
    filled: 0,
    roundtrip: 0
  };
}

function mergeCounter(target, source) {
  for (const key of Object.keys(target)) {
    target[key] += Number(source[key] || 0);
  }
  return target;
}

function classifyNoTradeReason(decision = {}, signal = {}) {
  const reasons = [
    ...(decision.reasons || []),
    ...(signal.risk_warnings || [])
  ].map((item) => String(item).toLowerCase());

  if (reasons.some((item) => item.includes('regime'))) return 'regime_blocked';
  if (reasons.some((item) => item.includes('quality') || item.includes('score'))) return 'score_too_low';
  if (reasons.some((item) => item.includes('budget') || item.includes('exposure cap') || item.includes('daily loss'))) {
    return 'risk_budget_exhausted';
  }
  if (reasons.some((item) => item.includes('correlated') || item.includes('cluster') || item.includes('conflict'))) {
    return 'correlation_conflict';
  }
  if (!ACTIVE_STATUS.has(String(signal.status || '').toUpperCase())) {
    return 'execution_window_closed';
  }
  return 'policy_filtered';
}

function singleRecordCounter(record) {
  const row = emptyCounter();
  row.universe += 1;
  if (record.prefilter_passed) row.prefilter_passed += 1;
  row.generated += 1;

  if (record.no_trade_reason === 'regime_blocked') row.regime_filtered += 1;
  else row.regime_filter_passed += 1;
  if (record.no_trade_reason === 'score_too_low') row.score_filtered += 1;
  else row.score_threshold_passed += 1;
  if (record.no_trade_reason === 'risk_budget_exhausted') row.risk_filtered += 1;
  else row.risk_filter_passed += 1;
  if (record.no_trade_reason === 'correlation_conflict') row.conflict_filtered += 1;
  else row.conflict_filter_passed += 1;

  if (record.executable) row.executable += 1;
  if (record.entered) row.entered_positions += 1;
  if (record.filled) row.filled += 1;
  if (record.roundtrip) row.roundtrip += 1;
  return row;
}

function stageDropoff(counter) {
  const pairs = [
    ['universe', 'prefilter_passed'],
    ['prefilter_passed', 'generated'],
    ['generated', 'regime_filter_passed'],
    ['regime_filter_passed', 'score_threshold_passed'],
    ['score_threshold_passed', 'risk_filter_passed'],
    ['risk_filter_passed', 'conflict_filter_passed'],
    ['conflict_filter_passed', 'executable'],
    ['executable', 'filled'],
    ['filled', 'roundtrip']
  ];

  return pairs.map(([from, to]) => {
    const fromValue = Number(counter[from] || 0);
    const toValue = Number(counter[to] || 0);
    const drop = Math.max(0, fromValue - toValue);
    return {
      stage: `${from}->${to}`,
      from: fromValue,
      to: toValue,
      drop_count: drop,
      drop_ratio: fromValue ? round(drop / fromValue, 4) : 0
    };
  });
}

function aggregateBy(records, keyName) {
  const bucket = new Map();
  for (const record of records) {
    const key = String(record[keyName] || 'unknown');
    const current = bucket.get(key) || emptyCounter();
    bucket.set(key, mergeCounter(current, singleRecordCounter(record)));
  }

  return Array.from(bucket.entries())
    .map(([key, counter]) => ({
      [keyName]: key,
      ...counter,
      dropoff: stageDropoff(counter)
    }))
    .sort((a, b) => b.generated - a.generated);
}

function topNoTradeReasons(records = []) {
  const counter = new Map();
  const denied = records.filter((item) => item.no_trade_reason);
  const total = denied.length || 1;

  for (const row of denied) {
    counter.set(row.no_trade_reason, (counter.get(row.no_trade_reason) || 0) + 1);
  }

  return Array.from(counter.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      share: round(count / total, 4)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function inferBottleneck(counter) {
  const map = {
    regime_filtered: counter.regime_filtered,
    score_filtered: counter.score_filtered,
    risk_filtered: counter.risk_filtered,
    conflict_filtered: counter.conflict_filtered,
    execution_gap: Math.max(0, counter.executable - counter.filled)
  };

  const [stage, value] = Object.entries(map).sort((a, b) => b[1] - a[1])[0] || ['none', 0];
  return {
    stage,
    count: value,
    diagnosis:
      stage === 'risk_filtered'
        ? 'Risk constraints are currently the biggest source of opportunity loss.'
        : stage === 'regime_filtered'
          ? 'Regime filter is currently gating the largest share of candidates.'
          : stage === 'score_filtered'
            ? 'Score thresholds are filtering too many candidates.'
            : stage === 'conflict_filtered'
              ? 'Conflict filter is suppressing many candidates due to overlap.'
              : 'Execution conversion is currently the largest bottleneck.'
  };
}

function thresholdSensitivity(records = []) {
  const withScore = records.filter((item) => Number.isFinite(Number(item.signal_score)));
  if (!withScore.length) {
    return {
      near_threshold_count: 0,
      near_threshold_share: 0,
      score_too_low_near_threshold: 0,
      diagnosis: 'No score records available for threshold sensitivity.'
    };
  }

  const nearThreshold = withScore.filter((item) => Math.abs(Number(item.signal_score) - 0.45) <= 0.05);
  const scoreTooLowNear = nearThreshold.filter((item) => item.no_trade_reason === 'score_too_low');

  const share = nearThreshold.length / withScore.length;
  return {
    near_threshold_count: nearThreshold.length,
    near_threshold_share: round(share, 4),
    score_too_low_near_threshold: scoreTooLowNear.length,
    diagnosis:
      share >= 0.35
        ? 'Large share of candidates sits near threshold; adaptive scoring may improve density.'
        : 'Threshold boundary pressure is moderate.'
  };
}

function overFilteringDetection(counter, thresholdDiag) {
  const blocked = counter.generated - counter.executable;
  const blockedRatio = counter.generated ? blocked / counter.generated : 0;
  const overFiltered = blockedRatio >= 0.65 && thresholdDiag.near_threshold_share >= 0.25;
  return {
    blocked_ratio: round(blockedRatio, 4),
    over_filtered: overFiltered,
    note: overFiltered
      ? 'Candidate starvation likely caused by strict filters and near-threshold rejects.'
      : 'No strong over-filtering signal from current window.'
  };
}

export function buildSignalFunnelDiagnosticsV2({
  asOf = new Date().toISOString(),
  signals = [],
  trades = [],
  tradeLevelBuckets = [],
  regimeState = {},
  universeSize = null
} = {}) {
  const bySignalId = new Map((tradeLevelBuckets || []).map((row) => [row.signal_id, row]));
  const filledIds = new Set();
  const roundtripIds = new Set();

  for (const trade of trades || []) {
    const signalId = trade.signal_id || trade.signalId;
    if (!signalId) continue;
    if (trade.time_in) filledIds.add(signalId);
    if (trade.time_out) roundtripIds.add(signalId);
  }

  const records = (signals || []).map((signal) => {
    const decision = bySignalId.get(signal.signal_id);
    const active = ACTIVE_STATUS.has(String(signal.status || '').toUpperCase());
    const prefilterPassed = Boolean(signal.signal_id && signal.symbol && signal.market);
    const executable = active && (!decision || decision.decision === 'allow' || decision.decision === 'reduce');
    const noTradeReason = !executable
      ? classifyNoTradeReason(decision || {}, signal)
      : null;

    return {
      signal_id: signal.signal_id,
      symbol: signal.symbol,
      market: signal.market,
      asset_class: signal.asset_class || 'unknown',
      trade_day: String(signal.created_at || signal.generated_at || '').slice(0, 10) || 'unknown',
      strategy_family: signal.strategy_family || 'unknown',
      regime: regimeState?.state?.primary || signal.regime_id || 'unknown',
      signal_score: Number(signal.score ?? null),
      prefilter_passed: prefilterPassed,
      executable,
      entered: executable,
      filled: filledIds.has(signal.signal_id),
      roundtrip: roundtripIds.has(signal.signal_id),
      no_trade_reason: noTradeReason
    };
  });

  const overall = records.reduce((acc, record) => mergeCounter(acc, singleRecordCounter(record)), emptyCounter());
  if (Number.isFinite(Number(universeSize)) && Number(universeSize) > overall.universe) {
    overall.universe = Number(universeSize);
  }

  const dropoff = stageDropoff(overall);
  const noTradeTopN = topNoTradeReasons(records);
  const bottleneck = inferBottleneck(overall);
  const thresholdDiag = thresholdSensitivity(records);
  const overFiltering = overFilteringDetection(overall, thresholdDiag);

  return {
    generated_at: asOf,
    diagnostics_version: 'signal-funnel.v2',
    overall,
    dropoff,
    no_trade_reason_top_n: noTradeTopN,
    threshold_sensitivity: thresholdDiag,
    over_filtering_detection: overFiltering,
    bottleneck,
    by_strategy_family: aggregateBy(records, 'strategy_family'),
    by_regime: aggregateBy(records, 'regime'),
    by_market: aggregateBy(records, 'market'),
    by_asset_class: aggregateBy(records, 'asset_class'),
    by_trade_day: aggregateBy(records, 'trade_day'),
    raw_records: records,
    explainability: {
      purpose: 'Explain low trading density by showing where opportunities are filtered out.',
      key_questions: [
        'Why are we getting too few trades?',
        'Where are candidates being filtered out?',
        'Are filters too strict for current regime?'
      ]
    }
  };
}

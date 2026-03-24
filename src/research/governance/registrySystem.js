import { ENTITY_STAGE, EXECUTION_MODE, normalizeStage, registryId } from './taxonomy.js';

function firstN(values, n = 3) {
  return (values || []).slice(0, n);
}

function toArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function toSummaryRow(label, value) {
  return `${label}=${value ?? '--'}`;
}

function stageForStrategyId(strategyId, championId, decisions) {
  if (strategyId === championId) return ENTITY_STAGE.CHAMPION;
  const decision = (decisions || []).find((item) => item.challenger_id === strategyId);
  if (!decision) return ENTITY_STAGE.TESTING;
  return normalizeStage(decision.status, ENTITY_STAGE.TESTING);
}

function alphaEvalSummary(alphaId, healthRows = []) {
  const hit = healthRows.find((item) => item.alpha_id === alphaId);
  if (!hit) return null;
  return {
    health: hit.health,
    recent_hit_rate: hit.recent_hit_rate,
    recent_pnl_proxy: hit.recent_pnl_proxy,
    decay_flag: hit.decay_flag,
  };
}

export function buildAlphaRegistry({
  alphaDefinitions = [],
  alphaHealth = [],
  asOf = new Date().toISOString(),
} = {}) {
  return alphaDefinitions.map((alpha) => ({
    registry_id: registryId('alpha', alpha.id, alpha.version || 'v1'),
    alpha_id: alpha.id,
    family: alpha.family,
    description: alpha.description,
    inputs: toArray(alpha.inputs),
    regime_fit: toArray(alpha.regime_fit),
    expected_holding_period: alpha.expected_holding_period,
    active_status: alpha.status === 'active' || alpha.status === 'paper',
    status: alpha.status,
    version: alpha.version || 'alpha-v1',
    last_eval_summary: alphaEvalSummary(alpha.id, alphaHealth),
    updated_at: asOf,
  }));
}

function modelEvalSummary(history, decision) {
  const backtest = history?.backtest || {};
  const paper = history?.paper?.summary || {};
  return {
    backtest_return: backtest.cumulative_return_post_cost ?? null,
    backtest_drawdown: backtest.max_drawdown ?? null,
    backtest_win_rate: backtest.win_rate ?? null,
    paper_return: paper.total_return ?? null,
    paper_win_rate: paper.win_rate ?? null,
    promotion_status: decision?.status || ENTITY_STAGE.TESTING,
    promotable: Boolean(decision?.promotable),
  };
}

export function buildModelRegistry({
  champion = {},
  challengers = [],
  decisions = [],
  asOf = new Date().toISOString(),
} = {}) {
  const rows = [];
  const all = [
    { type: 'champion', item: champion },
    ...challengers.map((item) => ({ type: 'challenger', item })),
  ];
  for (const row of all) {
    const cfg = row.item?.config || {};
    const strategyId = cfg.id || 'unknown';
    const strategyVersion = cfg.version || 'v1';
    const decision = decisions.find((item) => item.challenger_id === strategyId);
    const stage =
      row.type === 'champion'
        ? ENTITY_STAGE.CHAMPION
        : normalizeStage(decision?.status || ENTITY_STAGE.TESTING, ENTITY_STAGE.TESTING);
    rows.push({
      registry_id: registryId('model', strategyId, strategyVersion),
      model_id: `model_${strategyId}`,
      model_type: 'deterministic_scoring_stack',
      asset_class: 'multi_asset',
      training_dataset_id: `dataset_bundle_${String(asOf).slice(0, 10)}`,
      feature_set_name: 'multi_asset_feature_bundle_v1',
      label_definition: 'strategy_performance_and_risk_adjusted_outcomes',
      hyperparams_summary: {
        directional_threshold: cfg.directional_threshold ?? null,
        score_bias: cfg.score_bias ?? null,
        risk_penalty_multiplier: cfg.risk_penalty_multiplier ?? null,
        gross_exposure_multiplier: cfg.gross_exposure_multiplier ?? null,
      },
      created_at: asOf,
      current_stage: stage,
      evaluation_summary: modelEvalSummary(row.item, decision),
    });
  }
  return rows;
}

function buildStrategyChangeLog(baseConfig, currentConfig) {
  if (!baseConfig || !currentConfig) return [];
  const keys = [
    'directional_threshold',
    'score_bias',
    'risk_penalty_multiplier',
    'gross_exposure_multiplier',
    'max_holdings_multiplier',
    'max_single_weight_multiplier',
    'sector_cap_multiplier',
  ];
  const rows = [];
  for (const key of keys) {
    if (baseConfig[key] === undefined && currentConfig[key] === undefined) continue;
    if (baseConfig[key] === currentConfig[key]) continue;
    rows.push({
      field: key,
      from: baseConfig[key] ?? null,
      to: currentConfig[key] ?? null,
    });
  }
  return rows;
}

function strategyEvalSummary(history, decision) {
  const backtest = history?.backtest || {};
  const diagnostics = firstN(history?.snapshots || [], 3);
  return {
    backtest_return: backtest.cumulative_return_post_cost ?? null,
    drawdown: backtest.max_drawdown ?? null,
    turnover: backtest.turnover ?? null,
    promotable: Boolean(decision?.promotable),
    decision_status: decision?.status || ENTITY_STAGE.TESTING,
    recent_snapshot_dates: diagnostics.map((item) => item.date),
  };
}

export function buildStrategyRegistry({
  champion = {},
  challengers = [],
  decisions = [],
  alphaRegistry = [],
  asOf = new Date().toISOString(),
} = {}) {
  const championId = champion?.config?.id || 'champion';
  const baseConfig = champion?.config || {};
  const activeAlphaIds = alphaRegistry
    .filter((item) => item.status === 'active' || item.status === 'paper')
    .map((item) => item.id);
  const all = [champion, ...challengers];

  return all.map((history) => {
    const cfg = history?.config || {};
    const strategyId = cfg.id || 'unknown';
    const stage = stageForStrategyId(strategyId, championId, decisions);
    const decision = decisions.find((item) => item.challenger_id === strategyId);
    return {
      registry_id: registryId('strategy', strategyId, cfg.version || 'v1'),
      strategy_id: strategyId,
      asset_scope: ['US_STOCK', 'OPTIONS', 'CRYPTO'],
      enabled_alpha_ids: activeAlphaIds,
      enabled_model_ids: [`model_${strategyId}`],
      portfolio_logic: 'rank_select_with_regime_risk_constraints',
      risk_profile: {
        safety_sensitivity: cfg.safety_sensitivity ?? null,
        allow_c_in_high_vol: cfg.allow_c_in_high_vol ?? null,
      },
      execution_mode: EXECUTION_MODE.PAPER,
      current_stage: stage,
      evaluation_summary: strategyEvalSummary(history, decision),
      change_log: buildStrategyChangeLog(baseConfig, cfg),
      created_at: asOf,
      notes: [
        toSummaryRow('label', cfg.label || strategyId),
        toSummaryRow('version', cfg.version || 'v1'),
      ],
    };
  });
}

export function buildUnifiedRegistrySystem({
  alphaDefinitions = [],
  alphaHealth = [],
  champion = {},
  challengers = [],
  decisions = [],
  asOf = new Date().toISOString(),
} = {}) {
  const alphaRegistry = buildAlphaRegistry({
    alphaDefinitions,
    alphaHealth,
    asOf,
  });
  const modelRegistry = buildModelRegistry({
    champion,
    challengers,
    decisions,
    asOf,
  });
  const strategyRegistry = buildStrategyRegistry({
    champion,
    challengers,
    decisions,
    alphaRegistry: alphaDefinitions,
    asOf,
  });

  return {
    generated_at: asOf,
    alpha_registry: alphaRegistry,
    model_registry: modelRegistry,
    strategy_registry: strategyRegistry,
  };
}

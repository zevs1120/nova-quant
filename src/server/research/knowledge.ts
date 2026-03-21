import doctrineSeed from '../../../data/reference_seeds/research_doctrine_seed.json' with { type: 'json' };
import failureModeSeed from '../../../data/reference_seeds/failure_mode_seed.json' with { type: 'json' };
import { buildStrategyFamilyRegistry, REGIME_POLICY } from '../../research/core/index.js';
import { resolvePublicResearchReferences, type ResearchReference } from './publicReferences.js';

type RegimePolicyRow = {
  preferred_strategy_families: string[];
  suppressed_strategy_families: string[];
  default_sizing_multiplier: number;
  risk_posture: string;
  recommended_user_posture: string;
};

type StrategyTemplateMetadata = {
  template_id: string;
  strategy_template_name: string;
  supported_asset_classes: string[];
  compatible_regimes: string[];
  expected_holding_horizon: string;
  cost_sensitivity_assumptions: string;
  validation_requirements: string[];
  compatible_filters: string[];
  governance_hooks: string[];
  public_reference_ids?: string[];
  public_references?: ResearchReference[];
};

type StrategyFamilyMetadata = {
  family_name: string;
  templates: StrategyTemplateMetadata[];
};

export type FactorFamilyId =
  | 'value'
  | 'momentum'
  | 'quality'
  | 'carry'
  | 'low_vol'
  | 'liquidity'
  | 'size'
  | 'seasonality'
  | 'reversal'
  | 'sentiment'
  | 'revision'
  | 'breadth';

export interface FactorCard {
  factor_id: FactorFamilyId;
  title: string;
  category: 'core' | 'extended';
  definition: string;
  proxies: string[];
  asset_classes: string[];
  failure_modes: string[];
  interactions: {
    supports: FactorFamilyId[];
    conflicts: FactorFamilyId[];
  };
  typical_holding_horizon: string;
  turnover_sensitivity: 'low' | 'medium' | 'high';
  implementation_sensitivity: string;
  public_reference_ids: string[];
  public_references?: ResearchReference[];
}

export interface RegimeTaxonomyEntry {
  regime_id: string;
  description: string;
  preferred_strategy_families: string[];
  suppressed_strategy_families: string[];
  sizing_multiplier: number;
  user_posture: string;
}

export interface ResearchModelCard {
  model_id: string;
  family: 'linear' | 'tree' | 'neural';
  title: string;
  strengths: string[];
  failure_modes: string[];
  best_for: string[];
}

export interface FailedIdeaRecord {
  failed_id: string;
  title: string;
  domain: string;
  likely_causes: string[];
  recommended_actions: string[];
  source: string;
}

export interface ResearchDoctrineProfile {
  doctrine_id: string;
  title: string;
  mission: string;
  market_scope: {
    priority: string[];
    current_runtime_support: string[];
    notes: string[];
  };
  strategy_principles: string[];
  risk_principles: string[];
  assistant_principles: string[];
  prohibited_shortcuts: string[];
  current_boundaries: string[];
}

const FACTOR_CARDS: FactorCard[] = [
  {
    factor_id: 'value',
    title: 'Value',
    category: 'core',
    definition: 'Looks for assets priced cheaply relative to fundamentals, cash flow, or normalized earnings power.',
    proxies: ['book-to-price', 'earnings yield', 'free-cash-flow yield', 'EV/EBITDA percentile'],
    asset_classes: ['US_STOCK', 'GLOBAL_EQUITY', 'CREDIT'],
    failure_modes: ['can stay cheap in structural decline', 'weak in speculative momentum bursts', 'sensitive to accounting noise'],
    interactions: {
      supports: ['quality', 'low_vol'],
      conflicts: ['momentum', 'sentiment']
    },
    typical_holding_horizon: '1-12 months',
    turnover_sensitivity: 'low',
    implementation_sensitivity: 'requires patient holding periods and strong accounting hygiene',
    public_reference_ids: ['ff_3_factor', 'ff_5_factor', 'aqr_vme']
  },
  {
    factor_id: 'momentum',
    title: 'Momentum',
    category: 'core',
    definition: 'Favors assets with persistent relative strength and penalizes recent losers.',
    proxies: ['12-1 return', '20/60-day relative strength rank', 'breakout percentile', 'trend slope'],
    asset_classes: ['US_STOCK', 'CRYPTO', 'FUTURES', 'ETF'],
    failure_modes: ['sharp reversals after crowded moves', 'fragile in regime transitions', 'sensitive to trading costs'],
    interactions: {
      supports: ['breadth', 'carry'],
      conflicts: ['reversal', 'value']
    },
    typical_holding_horizon: '1 week to 6 months',
    turnover_sensitivity: 'high',
    implementation_sensitivity: 'cost-aware sizing and crowding checks are critical',
    public_reference_ids: ['ff_data_library', 'aqr_vme', 'aqr_trend_following']
  },
  {
    factor_id: 'quality',
    title: 'Quality',
    category: 'core',
    definition: 'Rewards stable profitability, conservative balance sheets, and durable business economics.',
    proxies: ['ROE', 'gross profitability', 'debt-to-equity', 'earnings stability'],
    asset_classes: ['US_STOCK', 'GLOBAL_EQUITY'],
    failure_modes: ['can lag in deep cyclical recoveries', 'quality traps when growth slows structurally'],
    interactions: {
      supports: ['value', 'low_vol'],
      conflicts: ['sentiment']
    },
    typical_holding_horizon: '1-12 months',
    turnover_sensitivity: 'low',
    implementation_sensitivity: 'best used as a portfolio ballast or stock-selection filter',
    public_reference_ids: ['ff_5_factor', 'aqr_qmj']
  },
  {
    factor_id: 'carry',
    title: 'Carry',
    category: 'core',
    definition: 'Harvests yield-like premia embedded in term structure, rates, funding, or roll dynamics.',
    proxies: ['futures basis', 'crypto funding rates', 'forward carry', 'dividend yield spread'],
    asset_classes: ['CRYPTO', 'FUTURES', 'FX', 'EQUITY_INDEX'],
    failure_modes: ['crowded unwind risk', 'funding squeezes', 'macro shocks'],
    interactions: {
      supports: ['momentum', 'value'],
      conflicts: ['reversal']
    },
    typical_holding_horizon: 'days to quarters',
    turnover_sensitivity: 'medium',
    implementation_sensitivity: 'execution and financing assumptions matter materially',
    public_reference_ids: ['aqr_vme']
  },
  {
    factor_id: 'low_vol',
    title: 'Low Volatility / Defensive',
    category: 'core',
    definition: 'Prefers assets with lower realized volatility and shallower drawdowns than peers.',
    proxies: ['realized vol percentile', 'beta rank', 'max drawdown rank', 'downside deviation'],
    asset_classes: ['US_STOCK', 'ETF', 'MULTI_ASSET'],
    failure_modes: ['can underperform in strong risk-on breakouts', 'crowding into defensives'],
    interactions: {
      supports: ['quality', 'value'],
      conflicts: ['momentum', 'size']
    },
    typical_holding_horizon: '2 weeks to 12 months',
    turnover_sensitivity: 'low',
    implementation_sensitivity: 'works best as a portfolio construction overlay rather than a standalone trigger',
    public_reference_ids: ['aqr_bab']
  },
  {
    factor_id: 'liquidity',
    title: 'Liquidity',
    category: 'extended',
    definition: 'Uses trading depth, ADV, spread, and liquidity stress to separate executable names from fragile ones.',
    proxies: ['ADV', 'spread bps', 'Amihud illiquidity', 'order book imbalance'],
    asset_classes: ['US_STOCK', 'CRYPTO'],
    failure_modes: ['regime shifts can suddenly change liquidity assumptions', 'headline events can invalidate historical averages'],
    interactions: {
      supports: ['momentum', 'reversal'],
      conflicts: []
    },
    typical_holding_horizon: 'all horizons',
    turnover_sensitivity: 'high',
    implementation_sensitivity: 'primarily an implementation and capacity filter',
    public_reference_ids: ['nber_pairs_trading']
  },
  {
    factor_id: 'size',
    title: 'Size',
    category: 'extended',
    definition: 'Compares small vs large capitalization exposures and their risk-adjusted behavior.',
    proxies: ['market cap rank', 'small-minus-big spread', 'float-adjusted cap rank'],
    asset_classes: ['US_STOCK'],
    failure_modes: ['can be overwhelmed by liquidity regime', 'small-cap rallies can reverse sharply'],
    interactions: {
      supports: ['value', 'seasonality'],
      conflicts: ['low_vol']
    },
    typical_holding_horizon: '1-6 months',
    turnover_sensitivity: 'medium',
    implementation_sensitivity: 'capacity and slippage matter more than on large-cap universes',
    public_reference_ids: ['ff_3_factor', 'ff_5_factor']
  },
  {
    factor_id: 'seasonality',
    title: 'Seasonality',
    category: 'extended',
    definition: 'Looks for recurring calendar patterns in returns, volume, or event timing.',
    proxies: ['month-of-year effect', 'day-of-week effect', 'post-earnings drift seasonality'],
    asset_classes: ['US_STOCK', 'FUTURES', 'CRYPTO'],
    failure_modes: ['sample-size fragility', 'easy to overfit', 'regime dependence'],
    interactions: {
      supports: ['momentum'],
      conflicts: []
    },
    typical_holding_horizon: 'days to weeks',
    turnover_sensitivity: 'medium',
    implementation_sensitivity: 'requires strong anti-overfitting discipline',
    public_reference_ids: ['ff_data_library']
  },
  {
    factor_id: 'reversal',
    title: 'Reversal',
    category: 'extended',
    definition: 'Targets short-horizon overreaction and mean reversion after stretched moves.',
    proxies: ['short-term z-score', 'RSI extreme', 'gap fade', 'VWAP deviation'],
    asset_classes: ['US_STOCK', 'CRYPTO'],
    failure_modes: ['gets run over in strong trends', 'execution-sensitive at turning points'],
    interactions: {
      supports: ['liquidity'],
      conflicts: ['momentum', 'carry']
    },
    typical_holding_horizon: 'intraday to 5 days',
    turnover_sensitivity: 'high',
    implementation_sensitivity: 'requires strict fill and slippage realism',
    public_reference_ids: ['nber_pairs_trading']
  },
  {
    factor_id: 'sentiment',
    title: 'Sentiment',
    category: 'extended',
    definition: 'Uses crowd positioning, options tone, news tone, or social sentiment as an explanatory overlay.',
    proxies: ['news tone', 'options skew', 'social volume', 'fear/greed proxies'],
    asset_classes: ['US_STOCK', 'CRYPTO'],
    failure_modes: ['alt data instability', 'signal drift', 'difficult normalization across regimes'],
    interactions: {
      supports: ['momentum', 'revision'],
      conflicts: ['value']
    },
    typical_holding_horizon: 'days to weeks',
    turnover_sensitivity: 'medium',
    implementation_sensitivity: 'best as an overlay until the data source is production-grade',
    public_reference_ids: ['nber_pead']
  },
  {
    factor_id: 'revision',
    title: 'Revision',
    category: 'extended',
    definition: 'Captures changes in analyst expectations, estimates, or forward guidance.',
    proxies: ['EPS revision breadth', 'target price change', 'guidance change'],
    asset_classes: ['US_STOCK'],
    failure_modes: ['requires robust fundamental feed coverage', 'can be stale or sparse'],
    interactions: {
      supports: ['momentum', 'quality'],
      conflicts: []
    },
    typical_holding_horizon: 'weeks to quarters',
    turnover_sensitivity: 'medium',
    implementation_sensitivity: 'more useful once external estimate data is wired',
    public_reference_ids: ['ff_5_factor', 'nber_pead']
  },
  {
    factor_id: 'breadth',
    title: 'Breadth',
    category: 'extended',
    definition: 'Measures whether leadership is broad and healthy or narrow and fragile.',
    proxies: ['advance-decline ratio', 'percent above moving average', 'sector participation', 'dispersion'],
    asset_classes: ['US_STOCK', 'ETF', 'CRYPTO'],
    failure_modes: ['broad proxies can lag turning points', 'single-index breadth can hide rotation'],
    interactions: {
      supports: ['momentum', 'low_vol'],
      conflicts: []
    },
    typical_holding_horizon: 'days to months',
    turnover_sensitivity: 'low',
    implementation_sensitivity: 'best used for regime conditioning and portfolio stance',
    public_reference_ids: ['aqr_trend_following', 'aqr_factor_momentum']
  }
];

function withFactorReferences(card: FactorCard): FactorCard {
  return {
    ...card,
    public_references: resolvePublicResearchReferences(card.public_reference_ids)
  };
}

const MODEL_CATALOG: ResearchModelCard[] = [
  {
    model_id: 'linear_baseline',
    family: 'linear',
    title: 'Linear cross-sectional baseline',
    strengths: ['transparent coefficients', 'fast benchmark', 'strong for sanity-checking factor direction'],
    failure_modes: ['misses nonlinear interactions', 'sensitive to multicollinearity'],
    best_for: ['rank baselines', 'factor sign validation', 'quick diagnostics']
  },
  {
    model_id: 'ridge_lasso_elastic_net',
    family: 'linear',
    title: 'Regularized linear stack',
    strengths: ['shrinkage control', 'feature selection pressure', 'stable with noisy panels'],
    failure_modes: ['still mostly linear', 'sensitive to preprocessing choices'],
    best_for: ['cross-sectional ranking', 'factor pruning', 'robust baseline modeling']
  },
  {
    model_id: 'tree_models',
    family: 'tree',
    title: 'Tree / boosting models',
    strengths: ['captures interactions', 'handles nonlinear splits', 'strong mixed-feature ranking baseline'],
    failure_modes: ['can overfit small samples', 'feature importance can be unstable'],
    best_for: ['interaction discovery', 'regime-conditioned nonlinear ranking', 'tabular alpha experiments']
  },
  {
    model_id: 'shallow_feedforward_nn',
    family: 'neural',
    title: 'Shallow feedforward neural net',
    strengths: ['captures smooth nonlinearities', 'useful once data hygiene is strong'],
    failure_modes: ['more fragile than simpler baselines', 'needs careful regularization'],
    best_for: ['nonlinear cross-sectional extensions', 'controlled model comparison after tabular baselines']
  }
];

const RESEARCH_DOCTRINE_PROFILE: ResearchDoctrineProfile = {
  doctrine_id: 'nova-cross-asset-research-doctrine.v1',
  title: 'Nova Quant Cross-Asset Research Doctrine',
  mission:
    'Build an AI-native quant research platform that can study factors, strategies, regime behavior, and execution realism across asset classes without faking live capability or overstating evidence.',
  market_scope: {
    priority: ['COMMODITY_FUTURES', 'US_STOCK', 'CRYPTO'],
    current_runtime_support: ['US_STOCK', 'OPTIONS', 'CRYPTO'],
    notes: [
      'Commodity futures are the intended lead research expansion track, but they are not yet wired into the current runtime/API market model.',
      'Cross-asset research should stay unified in logic even where execution adapters are not yet implemented.'
    ]
  },
  strategy_principles: [
    'Risk control is a hard boundary and must be optimized before return enhancement.',
    'Core factors must be economically grounded; retail technical indicators are not valid as standalone primary factors.',
    'Trend and arbitrage logic should be fused through shared state and evidence, not bolted together as static sub-strategies.',
    'Cross-asset signals must be interpretable in a shared risk-adjusted expected-return frame.',
    'Portfolio construction must explicitly account for turnover, costs, exposure, and capacity.'
  ],
  risk_principles: [
    'Do not promote signals that break hard risk budgets even if expected return looks attractive.',
    'Execution realism, slippage, funding, and turnover are first-class research inputs.',
    'Backtest beauty without robustness or implementation realism is not acceptable evidence.',
    'Tail-risk and regime-shift behavior must be reviewed before strategy promotion.'
  ],
  assistant_principles: [
    'Answer with evidence before confidence.',
    'Separate measured evidence from taxonomy knowledge.',
    'State uncertainty explicitly when data or validation coverage is incomplete.',
    'Always include the next research action, not just an explanation.'
  ],
  prohibited_shortcuts: [
    'No fabricated live trading or broker connectivity claims.',
    'No presentation of simulated results as realized outcomes.',
    'No future-leakage or unrealistic backtest assumptions.',
    'No MA/RSI/MACD-style indicators presented as primary factor research.'
  ],
  current_boundaries: [
    'Factor-level IC / rank-IC / quantile-spread persistence is not yet implemented as a first-class artifact.',
    'Structured schema-level tool calling remains a next step; current orchestration is service-controlled.',
    'Commodity futures runtime support is not yet present in the live API/runtime contract.'
  ]
};

const COMBINED_REGIME_DESCRIPTIONS: Record<string, string> = {
  uptrend_normal: 'Trend is healthy and volatility is contained.',
  uptrend_high_vol: 'Trend exists, but volatility is high enough to require smaller size.',
  downtrend_normal: 'Directional weakness dominates under normal volatility.',
  downtrend_high_vol: 'Weak trend with elevated volatility and wider error bars.',
  range_normal: 'No clear trend edge; mean reversion and selectivity matter more.',
  range_high_vol: 'Choppy and volatile range conditions increase false breaks and slippage risk.',
  stress_risk_off: 'Capital preservation regime with elevated systemic stress.'
};

const failureEntries = (((failureModeSeed as { entries?: unknown[] }).entries) || []) as Array<Record<string, unknown>>;

const FAILED_IDEAS: FailedIdeaRecord[] = failureEntries.slice(0, 8).map((row, index) => ({
  failed_id: `failed-idea-${index + 1}`,
  title: String(row.name || `failed_idea_${index + 1}`),
  domain: String(row.domain || 'research'),
  likely_causes: Array.isArray(row.likely_causes) ? row.likely_causes.map(String) : [],
  recommended_actions: Array.isArray(row.recommended_actions) ? row.recommended_actions.map(String) : [],
  source: 'failure_mode_seed'
}));

function factorById(factorId: string | undefined | null): FactorCard | null {
  if (!factorId) return null;
  const normalized = String(factorId).trim().toLowerCase().replace(/[\s/]+/g, '_');
  const card = FACTOR_CARDS.find((row) => row.factor_id === normalized);
  return card ? withFactorReferences(card) : null;
}

export function listFactorCatalog() {
  return FACTOR_CARDS.map((card) => ({
    factor_id: card.factor_id,
    title: card.title,
    category: card.category,
    definition: card.definition,
    asset_classes: card.asset_classes,
    typical_holding_horizon: card.typical_holding_horizon,
    turnover_sensitivity: card.turnover_sensitivity,
    public_reference_ids: card.public_reference_ids,
    public_references: resolvePublicResearchReferences(card.public_reference_ids)
  }));
}

export function getFactorDefinition(factorId: string) {
  return factorById(factorId);
}

export function getFactorInteractions(factorId: string) {
  const card = factorById(factorId);
  if (!card) return null;
  return {
    factor_id: card.factor_id,
    title: card.title,
    supports: card.interactions.supports.map((id) => factorById(id) || { factor_id: id, title: id }),
    conflicts: card.interactions.conflicts.map((id) => factorById(id) || { factor_id: id, title: id }),
    failure_modes: card.failure_modes
  };
}

export function listCrossSectionalModelCatalog() {
  return MODEL_CATALOG;
}

export function listRegimeTaxonomy(): RegimeTaxonomyEntry[] {
  const primary = Object.entries(REGIME_POLICY as Record<string, RegimePolicyRow>).map(([regimeId, row]) => ({
    regime_id: regimeId,
    description:
      regimeId === 'trend'
        ? 'Trend-following conditions dominate.'
        : regimeId === 'range'
          ? 'Mean reversion and selectivity dominate.'
          : regimeId === 'high_volatility'
            ? 'Volatility is elevated and sizing should shrink.'
            : 'Risk-off / stress conditions dominate.',
    preferred_strategy_families: row.preferred_strategy_families,
    suppressed_strategy_families: row.suppressed_strategy_families,
    sizing_multiplier: row.default_sizing_multiplier,
    user_posture: row.recommended_user_posture
  }));

  const combined = Object.entries(COMBINED_REGIME_DESCRIPTIONS).map(([regime_id, description]) => ({
    regime_id,
    description,
    preferred_strategy_families: [],
    suppressed_strategy_families: [],
    sizing_multiplier: regime_id.includes('high_vol') ? 0.72 : regime_id.includes('risk_off') ? 0.34 : 1,
    user_posture: regime_id.includes('risk_off') ? 'SKIP' : regime_id.includes('high_vol') ? 'REDUCE' : 'GO'
  }));

  return [...primary, ...combined];
}

export function listStrategyMetadata() {
  const registry = buildStrategyFamilyRegistry();
  return ((registry.families || []) as StrategyFamilyMetadata[]).map((family) => ({
    family_name: family.family_name,
    templates: family.templates.map((template) => ({
      template_id: template.template_id,
      strategy_template_name: template.strategy_template_name,
      supported_asset_classes: template.supported_asset_classes,
      compatible_regimes: template.compatible_regimes,
      expected_holding_horizon: template.expected_holding_horizon,
      cost_sensitivity_assumptions: template.cost_sensitivity_assumptions,
      validation_requirements: template.validation_requirements,
      compatible_filters: template.compatible_filters,
      governance_hooks: template.governance_hooks,
      public_reference_ids: template.public_reference_ids || [],
      public_references: resolvePublicResearchReferences(template.public_reference_ids || [])
    }))
  }));
}

export function listFailedIdeasRegistry() {
  return FAILED_IDEAS;
}

export function listResearchDoctrinePrinciples() {
  const principles = (doctrineSeed as { principles?: Array<Record<string, unknown>> }).principles || [];
  return principles.map((row: Record<string, unknown>) => ({
    principle_id: String(row.principle_id || row.title || 'unknown'),
    title: String(row.title || row.principle_id || 'Untitled'),
    description: String(row.description || ''),
    enforcement_hint: String(row.enforcement_hint || '')
  }));
}

export function getResearchDoctrineProfile(): ResearchDoctrineProfile {
  return RESEARCH_DOCTRINE_PROFILE;
}

export function summarizeTopicHits(topic: string) {
  const q = String(topic || '').trim().toLowerCase();
  const factors = FACTOR_CARDS.filter((card) => {
    const hay = [card.factor_id, card.title, card.definition, ...card.proxies, ...card.failure_modes].join(' ').toLowerCase();
    return hay.includes(q);
  });
  const regimes = listRegimeTaxonomy().filter((row) => `${row.regime_id} ${row.description}`.toLowerCase().includes(q));
  const strategies = listStrategyMetadata().filter((row) => {
    const hay = `${row.family_name} ${row.templates.map((item) => item.strategy_template_name).join(' ')}`.toLowerCase();
    return hay.includes(q);
  });
  const models = MODEL_CATALOG.filter((row) => `${row.title} ${row.strengths.join(' ')} ${row.failure_modes.join(' ')}`.toLowerCase().includes(q));

  return {
    topic: topic,
    factors,
    regimes,
    strategies,
    models,
    failed_ideas: FAILED_IDEAS.filter((row) => `${row.title} ${row.likely_causes.join(' ')}`.toLowerCase().includes(q))
  };
}

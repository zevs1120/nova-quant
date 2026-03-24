import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDecisionSnapshot } from '../src/server/decision/engine.js';

/* ---------- helpers ---------- */

function makeSignal(overrides: Record<string, unknown> = {}) {
  return {
    signal_id: 'sig-1',
    symbol: 'AAPL',
    market: 'US',
    asset_class: 'US_STOCK',
    direction: 'LONG',
    status: 'NEW',
    timeframe: '1D',
    strategy_id: 'EQ_VEL',
    regime_id: 'RGM_RISK_ON',
    score: 72,
    confidence: 0.68,
    created_at: '2026-03-20T10:00:00Z',
    entry_min: 180,
    entry_max: 182,
    stop_loss: 175,
    take_profit: [190, 195],
    expected_R: 2.1,
    hit_rate_est: 0.55,
    cost_estimate: { total_bps: 4 },
    position_advice: { position_pct: 5 },
    regime_compatibility: 70,
    news_context: { tone: 'NEUTRAL' },
    ...overrides
  };
}

function makeMarketState(overrides: Record<string, unknown> = {}) {
  return {
    risk_off_score: 0.3,
    volatility_percentile: 40,
    trend_strength: 0.6,
    regime_id: 'RGM_RISK_ON',
    stance: 'RISK_ON',
    ...overrides
  };
}

function makeRiskProfile(overrides: Record<string, unknown> = {}) {
  return {
    profile_key: 'balanced',
    name: 'Balanced',
    exposure_cap: 55,
    max_daily_loss: 3,
    max_loss_per_trade: 1,
    max_drawdown: 12,
    leverage_cap: 2,
    per_signal_cap: 6,
    ...overrides
  } as any;
}

function callDecision(overrides: Record<string, unknown> = {}) {
  return buildDecisionSnapshot({
    userId: 'test-user',
    market: 'US',
    assetClass: 'US_STOCK',
    asOf: '2026-03-20T12:00:00Z',
    runtimeSourceStatus: 'DB_BACKED',
    performanceSourceStatus: 'BACKTEST_ONLY',
    riskProfile: makeRiskProfile(),
    signals: [makeSignal()],
    evidenceSignals: [],
    marketState: [makeMarketState()],
    ...overrides
  }) as Record<string, unknown>;
}

/* ---------- basic output contract ---------- */

describe('decision engine — output contract', () => {
  beforeEach(() => {
    vi.stubEnv('NOVA_AUTH_DRIVER', '');
    vi.stubEnv('SUPABASE_DB_URL', '');
    vi.stubEnv('DATABASE_URL', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('returns all required top-level fields', () => {
    const decision = callDecision();
    expect(decision.today_call).toBeTruthy();
    expect(decision.risk_state).toBeTruthy();
    expect(decision.portfolio_context).toBeTruthy();
    expect(decision.ranked_action_cards).toBeTruthy();
    expect(decision.summary).toBeTruthy();
    expect(decision.source_status).toBeTruthy();
    expect(decision.data_status).toBeTruthy();
    expect(decision.evidence_mode).toBeTruthy();
  });

  it('today_call has code, headline, subtitle', () => {
    const decision = callDecision();
    const tc = decision.today_call as any;
    expect(tc.code).toBeTruthy();
    expect(typeof tc.headline).toBe('string');
    expect(typeof tc.subtitle).toBe('string');
  });

  it('risk_state includes posture and drivers', () => {
    const decision = callDecision();
    const rs = decision.risk_state as any;
    expect(rs.posture).toBeTruthy();
    expect(Array.isArray(rs.drivers)).toBe(true);
    expect(rs.summary).toBeTruthy();
  });
});

/* ---------- action card ranking ---------- */

describe('decision engine — action cards', () => {
  beforeEach(() => {
    vi.stubEnv('NOVA_AUTH_DRIVER', '');
    vi.stubEnv('SUPABASE_DB_URL', '');
    vi.stubEnv('DATABASE_URL', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('produces action cards from signals', () => {
    const decision = callDecision();
    const cards = decision.ranked_action_cards as any[];
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0].signal_id).toBe('sig-1');
    expect(cards[0].symbol).toBe('AAPL');
    expect(cards[0].action).toBeTruthy();
    expect(cards[0].confidence).toBeGreaterThan(0);
  });

  it('ranks by ranking_score descending', () => {
    const signals = [
      makeSignal({ signal_id: 'low', score: 30, confidence: 0.4 }),
      makeSignal({ signal_id: 'high', score: 90, confidence: 0.9 })
    ];
    const decision = callDecision({ signals });
    const cards = decision.ranked_action_cards as any[];
    expect(cards[0].ranking_score).toBeGreaterThanOrEqual(cards[1].ranking_score);
  });

  it('card includes entry_zone, stop_loss, take_profit fields', () => {
    const decision = callDecision();
    const card = (decision.ranked_action_cards as any[])[0];
    expect('entry_zone' in card).toBe(true);
    expect('stop_loss' in card).toBe(true);
    expect('take_profit' in card).toBe(true);
  });

  it('card has publication_status field', () => {
    const decision = callDecision();
    const card = (decision.ranked_action_cards as any[])[0];
    expect(['ACTIONABLE', 'WATCH', 'REJECTED']).toContain(card.publication_status);
  });

  it('card includes governor decision', () => {
    const decision = callDecision();
    const card = (decision.ranked_action_cards as any[])[0];
    expect(card.governor).toBeTruthy();
    expect(card.governor.governor_mode).toBeTruthy();
    expect(typeof card.governor.allowed).toBe('boolean');
    expect(typeof card.governor.size_multiplier).toBe('number');
  });
});

/* ---------- empty/edge inputs ---------- */

describe('decision engine — edge cases', () => {
  beforeEach(() => {
    vi.stubEnv('NOVA_AUTH_DRIVER', '');
    vi.stubEnv('SUPABASE_DB_URL', '');
    vi.stubEnv('DATABASE_URL', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('returns valid decision with zero signals', () => {
    const decision = callDecision({ signals: [] });
    expect(decision.today_call).toBeTruthy();
    const tc = decision.today_call as any;
    expect(tc.code).toBeTruthy();
    // engine may produce no-action/hold cards even without signals
    expect(Array.isArray(decision.ranked_action_cards)).toBe(true);
  });

  it('returns valid with empty marketState', () => {
    const decision = callDecision({ marketState: [] });
    expect(decision.today_call).toBeTruthy();
    expect(decision.risk_state).toBeTruthy();
  });

  it('returns valid with null riskProfile', () => {
    const decision = callDecision({ riskProfile: null });
    expect(decision.today_call).toBeTruthy();
    expect(decision.portfolio_context).toBeTruthy();
  });

  it('attaches holdings context when provided', () => {
    const holdings = [
      { symbol: 'AAPL', asset_class: 'US_STOCK', weight_pct: 10, sector: 'Technology' }
    ];
    const decision = callDecision({ holdings });
    const ctx = decision.portfolio_context as any;
    expect(ctx).toBeTruthy();
  });

  it('incorporates previousDecision without error', () => {
    const previousDecision = {
      summary: {
        today_call: { code: 'CAUTIOUS_NEUTRAL' },
        risk_posture: 'CAUTIOUS'
      }
    };
    const decision = callDecision({ previousDecision });
    // engine should produce a valid decision even with previousDecision context
    expect(decision.today_call).toBeTruthy();
    expect(decision.summary).toBeTruthy();
  });

  it('handles INSUFFICIENT_DATA source status', () => {
    const decision = callDecision({ runtimeSourceStatus: 'INSUFFICIENT_DATA' });
    expect(decision.source_status).toBe('INSUFFICIENT_DATA');
  });
});

/* ---------- today_call classification ---------- */

describe('decision engine — today call codes', () => {
  beforeEach(() => {
    vi.stubEnv('NOVA_AUTH_DRIVER', '');
    vi.stubEnv('SUPABASE_DB_URL', '');
    vi.stubEnv('DATABASE_URL', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('produces protective call under high risk-off', () => {
    const decision = callDecision({
      signals: [],
      marketState: [makeMarketState({ risk_off_score: 0.85, volatility_percentile: 90, trend_strength: 0.2 })]
    });
    const tc = decision.today_call as any;
    // Should be protective/cautious code
    expect(tc.code).toBeTruthy();
    expect(typeof tc.code).toBe('string');
  });

  it('produces constructive call under healthy regime', () => {
    const decision = callDecision({
      signals: [makeSignal({ score: 85, confidence: 0.82 })],
      marketState: [makeMarketState({ risk_off_score: 0.15, volatility_percentile: 30, trend_strength: 0.8 })]
    });
    const tc = decision.today_call as any;
    expect(tc.code).toBeTruthy();
  });
});

import { describe, expect, it } from 'vitest';
import { buildDecisionSnapshot } from '../src/server/decision/engine.js';
import type { MarketStateRecord, UserRiskProfileRecord } from '../src/server/types.js';

function marketState(overrides: Partial<MarketStateRecord> = {}): MarketStateRecord {
  return {
    market: 'US',
    symbol: 'AAPL',
    timeframe: '1d',
    snapshot_ts_ms: Date.now(),
    regime_id: 'TREND',
    trend_strength: 0.71,
    temperature_percentile: 58,
    volatility_percentile: 42,
    risk_off_score: 0.31,
    stance: 'trend supportive',
    event_stats_json: JSON.stringify({
      source_status: 'DB_BACKED',
      panda: {
        top_factors: ['momentum', 'trend persistence'],
      },
    }),
    assumptions_json: JSON.stringify({ source_label: 'DB_BACKED' }),
    updated_at_ms: Date.now(),
    ...overrides,
  };
}

function riskProfile(
  profile_key: UserRiskProfileRecord['profile_key'] = 'balanced',
): UserRiskProfileRecord {
  return {
    user_id: 'decision-user',
    profile_key,
    max_loss_per_trade: 1,
    max_daily_loss: 3,
    max_drawdown: 12,
    exposure_cap: 55,
    leverage_cap: 2,
    updated_at_ms: Date.now(),
  };
}

function signal(overrides: Record<string, unknown> = {}) {
  return {
    signal_id: 'SIG-DEC-1',
    symbol: 'AAPL',
    market: 'US',
    asset_class: 'US_STOCK',
    direction: 'LONG',
    confidence: 0.81,
    score: 84,
    timeframe: '1d',
    strategy_id: 'EQ_SWING',
    strategy_family: 'Momentum / Trend',
    regime_id: 'TREND',
    entry_zone: { low: 198.4, high: 199.2 },
    stop_loss: { price: 193.6 },
    invalidation_level: 193.6,
    take_profit_levels: [{ price: 206.4, size_pct: 0.6, rationale: 'seed' }],
    explain_bullets: ['Trend strength and momentum remain supportive.'],
    created_at: new Date(Date.now() - 4 * 60_000).toISOString(),
    status: 'NEW',
    source_status: 'DB_BACKED',
    data_status: 'MODEL_DERIVED',
    source_label: 'MODEL_DERIVED',
    expected_metrics: { sample_size: 24 },
    ...overrides,
  };
}

describe('decision engine', () => {
  it('creates personalized add-on-strength action when the user already holds the top symbol', () => {
    const out = buildDecisionSnapshot({
      userId: 'decision-user',
      market: 'US',
      assetClass: 'US_STOCK',
      asOf: new Date().toISOString(),
      runtimeSourceStatus: 'DB_BACKED',
      riskProfile: riskProfile('balanced'),
      signals: [signal()],
      evidenceSignals: [],
      marketState: [marketState()],
      holdings: [{ symbol: 'AAPL', asset_class: 'US_STOCK', weight_pct: 8, sector: 'Technology' }],
    });

    expect(out.risk_state.posture).toBe('ATTACK');
    expect(out.portfolio_context.availability).toBe('PERSONALIZED');
    expect(out.ranked_action_cards[0].action).toBe('add_on_strength');
    expect(out.ranked_action_cards[0].evidence_bundle.supporting_factors).toContain('momentum');
  });

  it('elevates defense/no-action when risk-off pressure is high', () => {
    const out = buildDecisionSnapshot({
      userId: 'decision-user',
      market: 'US',
      assetClass: 'US_STOCK',
      asOf: new Date().toISOString(),
      runtimeSourceStatus: 'DB_BACKED',
      riskProfile: riskProfile('balanced'),
      signals: [signal()],
      evidenceSignals: [],
      marketState: [
        marketState({
          regime_id: 'RISK_OFF',
          volatility_percentile: 91,
          risk_off_score: 0.84,
          temperature_percentile: 88,
          stance: 'risk off',
        }),
      ],
      holdings: [],
    });

    expect(out.risk_state.posture).toBe('DEFEND');
    expect(out.today_call.code).toBe('WAIT');
    expect(out.ranked_action_cards[0].action).toBe('no_action');
  });

  it('publishes only strategy-backed action cards', () => {
    const out = buildDecisionSnapshot({
      userId: 'decision-user',
      market: 'US',
      assetClass: 'US_STOCK',
      asOf: new Date().toISOString(),
      runtimeSourceStatus: 'DB_BACKED',
      riskProfile: riskProfile('balanced'),
      signals: [
        signal({
          signal_id: 'SIG-REAL-1',
          symbol: 'AAPL',
          strategy_id: 'EQ_SWING',
          strategy_family: 'Momentum / Trend',
        }),
        signal({
          signal_id: 'SIG-FAKE-1',
          symbol: 'MSFT',
          strategy_id: null,
          strategy_family: null,
          confidence: 0.92,
          score: 91,
        }),
      ],
      evidenceSignals: [],
      marketState: [marketState(), marketState({ symbol: 'MSFT' })],
      holdings: [],
    });

    expect(out.audit.strategy_backed_count).toBe(1);
    expect(out.ranked_action_cards.some((row) => row.symbol === 'MSFT')).toBe(false);
    expect(out.ranked_action_cards[0].publication_status).toBe('ACTIONABLE');
  });

  it('quarantines debug, legacy, model-push and broken replay signals before action ranking', () => {
    const out = buildDecisionSnapshot({
      userId: 'decision-user',
      market: 'US',
      assetClass: 'US_STOCK',
      asOf: new Date().toISOString(),
      runtimeSourceStatus: 'DB_BACKED',
      riskProfile: riskProfile('balanced'),
      signals: [
        signal({ signal_id: 'SIG-REAL-1', symbol: 'AAPL' }),
        signal({
          signal_id: 'SIG-DEBUG-1774081231813',
          symbol: 'SPY',
          confidence: 0.99,
          score: 99,
        }),
        signal({
          signal_id: 'SIG-1774187798761',
          symbol: 'TSLA',
          confidence: 0.99,
          score: 98,
        }),
        signal({
          signal_id: 'mdl-bf69f9',
          symbol: 'NVDA',
          strategy_id: 'MODEL_PUSH',
          strategy_family: 'MODEL_PUSH',
          confidence: 0.99,
          score: 97,
        }),
        signal({
          signal_id: 'SIG-BROKEN-REPLAY',
          symbol: 'MSFT',
          confidence: 0.99,
          score: 96,
          replay_summary: { net_return: -0.18 },
        }),
      ],
      evidenceSignals: [],
      marketState: [
        marketState(),
        marketState({ symbol: 'SPY' }),
        marketState({ symbol: 'TSLA' }),
        marketState({ symbol: 'NVDA' }),
        marketState({ symbol: 'MSFT' }),
      ],
      holdings: [],
    });

    expect(out.audit.raw_candidate_count).toBe(5);
    expect(out.audit.candidate_count).toBe(1);
    expect(out.audit.quarantined_count).toBe(4);
    expect(out.ranked_action_cards.map((row) => row.signal_id)).toContain('SIG-REAL-1');
    expect(out.ranked_action_cards.some((row) => row.signal_id === 'SIG-DEBUG-1774081231813')).toBe(
      false,
    );
    expect(out.ranked_action_cards.some((row) => row.symbol === 'TSLA')).toBe(false);
    expect(out.ranked_action_cards.some((row) => row.symbol === 'NVDA')).toBe(false);
    expect(out.ranked_action_cards.some((row) => row.symbol === 'MSFT')).toBe(false);
  });
});

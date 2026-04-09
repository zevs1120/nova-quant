import { InMemorySyncDb as Database } from '../src/server/db/inMemorySyncDb.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import type { SignalContract } from '../src/server/types.js';
import { runAlphaDiscoveryCycle } from '../src/server/alpha_discovery/index.js';
import { evaluateAlphaCandidates } from '../src/server/alpha_evaluator/index.js';
import {
  buildAlphaRegistrySummary,
  persistAlphaCandidate,
  type AutonomousAlphaCandidate,
} from '../src/server/alpha_registry/index.js';
import {
  reviewAlphaBacktestOutcomes,
  reviewAlphaShadowCandidates,
} from '../src/server/alpha_promotion_guard/index.js';
import {
  runAlphaShadowCycle,
  summarizeAlphaShadowPerformance,
} from '../src/server/alpha_shadow_runner/index.js';

function buildCandidate(id: string): AutonomousAlphaCandidate {
  return {
    id,
    thesis: 'Volume-filtered trend continuation candidate',
    family: 'trend_continuation_refinement',
    formula: {
      template_id: 'TMP-BREAKOUT-CONT',
    },
    params: {
      breakout_percentile: 0.85,
      trend_lookback: 30,
    },
    feature_dependencies: ['trend_strength', 'volume_expansion', 'breakout_distance'],
    regime_constraints: ['trend'],
    compatible_markets: ['US'],
    intended_holding_period: '2-6 bars',
    entry_logic: {
      trigger: 'breakout_with_volume',
    },
    exit_logic: {
      stop: 'atr_trail',
    },
    sizing_hint: {
      path: 'signal_input',
    },
    required_inputs: ['trend_strength', 'volume_expansion'],
    complexity_score: 1.02,
    integration_path: 'signal_input',
    created_at: new Date().toISOString(),
    source: 'autonomous_discovery',
    strategy_candidate: null,
  };
}

function buildSignal(id: string, symbol = 'AAPL'): SignalContract {
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 86_400_000).toISOString();
  return {
    id,
    created_at: now,
    expires_at: later,
    asset_class: 'US_STOCK',
    market: 'US',
    symbol,
    timeframe: '1d',
    strategy_id: 'TREND_PULLBACK',
    strategy_family: 'Momentum / Trend Following',
    strategy_version: 'test.v1',
    regime_id: 'TREND',
    temperature_percentile: 64,
    volatility_percentile: 54,
    direction: 'LONG',
    strength: 72,
    confidence: 0.68,
    entry_zone: {
      low: 100,
      high: 101,
      method: 'LIMIT',
    },
    invalidation_level: 97,
    stop_loss: {
      type: 'ATR',
      price: 97,
      rationale: 'test stop',
    },
    take_profit_levels: [
      {
        price: 104,
        size_pct: 0.6,
        rationale: 'tp1',
      },
      {
        price: 107,
        size_pct: 0.4,
        rationale: 'tp2',
      },
    ],
    trailing_rule: {
      type: 'EMA',
      params: { ema_fast: 10, ema_slow: 30 },
    },
    position_advice: {
      position_pct: 5,
      leverage_cap: 1,
      risk_bucket_applied: 'BASE',
      rationale: 'test sizing',
    },
    cost_model: {
      fee_bps: 1.5,
      spread_bps: 1,
      slippage_bps: 1.8,
    },
    expected_metrics: {
      expected_R: 1.2,
      hit_rate_est: 0.55,
      sample_size: 20,
    },
    explain_bullets: ['test signal'],
    execution_checklist: ['check data'],
    tags: ['status:DB_BACKED'],
    status: 'NEW',
    payload: {
      kind: 'STOCK_SWING',
      data: {
        horizon: 'MEDIUM',
        catalysts: ['test'],
      },
    },
    score: 78,
    payload_version: '1',
  };
}

function buildBars(startMs: number, count: number, startPrice = 100) {
  return Array.from({ length: count }).map((_, index) => {
    const base = startPrice + index;
    return {
      ts_open: startMs + index * 86_400_000,
      open: String(base),
      high: String(base + 5),
      low: String(base - 3),
      close: String(base + 2),
      volume: String(1_000_000 + index * 10_000),
    };
  });
}

function buildBreakoutReplayBars(startMs: number, count: number) {
  let price = 100;
  return Array.from({ length: count }).map((_, index) => {
    const breakout = index > 35 && index % 12 === 0;
    const drift = breakout ? 4.2 : index % 12 <= 4 ? 0.55 : -0.18;
    const open = price;
    price = Math.max(20, price + drift);
    const close = price;
    const high = Math.max(open, close) + (breakout ? 2.4 : 0.8);
    const low = Math.min(open, close) - 0.8;
    return {
      ts_open: startMs + index * 86_400_000,
      open: open.toFixed(2),
      high: high.toFixed(2),
      low: low.toFixed(2),
      close: close.toFixed(2),
      volume: String(breakout ? 3_200_000 : 1_000_000 + index * 2000),
    };
  });
}

describe('alpha discovery loop', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('registers and evaluates autonomous alpha candidates without direct prod promotion', async () => {
    vi.stubEnv('NOVA_ALPHA_DISCOVERY_ENABLED', '1');
    vi.stubEnv('NOVA_ALPHA_DISCOVERY_MAX_CANDIDATES', '6');
    vi.stubEnv('NOVA_ALPHA_DISCOVERY_SEARCH_BUDGET', '2');

    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);

    repo.upsertMarketStates([
      {
        market: 'US',
        symbol: 'AAPL',
        timeframe: '1d',
        snapshot_ts_ms: Date.now(),
        regime_id: 'TREND',
        trend_strength: 0.72,
        temperature_percentile: 68,
        volatility_percentile: 55,
        risk_off_score: 0.22,
        stance: 'Trend regime',
        event_stats_json: JSON.stringify({}),
        assumptions_json: JSON.stringify({}),
        updated_at_ms: Date.now(),
      },
    ]);

    const result = await runAlphaDiscoveryCycle({
      repo,
      userId: 'alpha-user',
      triggerType: 'manual',
    });

    const candidates = repo.listAlphaCandidates({ limit: 80 });
    const evaluations = repo.listAlphaEvaluations({ limit: 80 });

    expect((result as Record<string, unknown>).generation_summary).toBeTruthy();
    expect(candidates.length).toBeGreaterThan(0);
    expect(evaluations.length).toBeGreaterThan(0);
    expect(candidates.some((row) => row.status === 'PROD')).toBe(false);
    expect(
      candidates.some(
        (row) => row.status === 'SHADOW' || row.status === 'REJECTED' || row.status === 'DRAFT',
      ),
    ).toBe(true);
  });

  it('uses candidate-level OHLCV replay when bars are available for alpha evaluation', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const now = Date.UTC(2026, 0, 1);
    const asset = repo.upsertAsset({
      symbol: 'AAPL',
      market: 'US',
      venue: 'TEST',
      status: 'ACTIVE',
    });
    repo.upsertOhlcvBars(asset.asset_id, '1d', buildBreakoutReplayBars(now, 180), 'TEST');

    const candidate = {
      ...buildCandidate('alpha-bar-replay-eval'),
      formula: {
        hypothesis_id: 'HYP-PUBLIC-VOLMAN-TSMOM-001',
        template_id: 'TPL-PUBLIC-VOLMAN-TSMOM-01',
      },
      strategy_candidate: {
        hypothesis_id: 'HYP-PUBLIC-VOLMAN-TSMOM-001',
        hypothesis_description: 'Volatility managed momentum test hypothesis',
        template_id: 'TPL-PUBLIC-VOLMAN-TSMOM-01',
        template_name: 'Volatility Managed Momentum',
        candidate_source_metadata: {
          hypothesis_source: {
            public_reference_ids: ['nber_volatility_managed_portfolios'],
            public_reference_urls: ['https://www.nber.org/papers/w22208'],
          },
          template_source: {
            public_reference_ids: ['moskowitz_ooi_pedersen_tsmom'],
            public_reference_urls: [
              'https://research-api.cbs.dk/ws/portalfiles/portal/58851003/time_series_momentum_lasse_heje.pdf',
            ],
          },
        },
      },
    };
    persistAlphaCandidate(repo, {
      candidate,
      status: 'DRAFT',
    });
    const result = evaluateAlphaCandidates({
      repo,
      candidates: [candidate],
      workflowRunId: 'workflow-alpha-replay-eval',
      config: {
        minAcceptanceScore: 0.3,
        correlationRejectThreshold: 0.98,
        maxComplexityScore: 3,
      },
    });

    expect(result.evaluated).toHaveLength(1);
    const metrics = result.evaluated[0]?.metrics;
    expect(metrics?.proxy_only).toBe(false);
    expect(metrics?.bar_replay.closed_trades).toBeGreaterThanOrEqual(6);
    expect(metrics?.bar_replay.source).toBe('ohlcv_candidate_replay');
    expect(metrics?.bar_replay.replay_family).toBe('volatility_managed_momentum');
    expect(metrics?.backtest_proxy.note).toContain('bar replay');
    expect(metrics?.research_evidence?.hypothesis_id).toBe('HYP-PUBLIC-VOLMAN-TSMOM-001');
    expect(metrics?.research_evidence?.public_reference_urls).toContain(
      'https://www.nber.org/papers/w22208',
    );

    const artifacts = repo.listBacktestArtifacts(
      String(result.evaluated[0]?.evaluation.backtest_run_id),
    );
    const evidenceArtifact = artifacts.find(
      (row) => row.artifact_type === 'alpha_discovery_research_evidence',
    );
    const evidencePayload = JSON.parse(String(evidenceArtifact?.path_or_payload || '{}'));
    expect(evidencePayload.template_id).toBe('TPL-PUBLIC-VOLMAN-TSMOM-01');
    expect(evidencePayload.public_reference_ids).toContain('moskowitz_ooi_pedersen_tsmom');
  });

  it('summarizes alpha yield by hypothesis and template lineage', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const candidate = {
      ...buildCandidate('alpha-yield-board'),
      formula: {
        hypothesis_id: 'HYP-MOM-TEST',
        template_id: 'TMP-BREAKOUT-TEST',
      },
      strategy_candidate: {
        hypothesis_id: 'HYP-MOM-TEST',
        template_id: 'TMP-BREAKOUT-TEST',
      },
    };

    persistAlphaCandidate(repo, {
      candidate,
      status: 'SHADOW',
      acceptanceScore: 0.74,
    });
    repo.insertAlphaEvaluation({
      id: 'alpha-eval-yield-board',
      alpha_candidate_id: candidate.id,
      workflow_run_id: 'workflow-alpha-yield-board',
      backtest_run_id: 'alpha-backtest-yield-board',
      evaluation_status: 'PASS',
      acceptance_score: 0.74,
      metrics_json: JSON.stringify({
        proxy_only: false,
        net_pnl: 0.04,
        bar_replay: {
          closed_trades: 12,
        },
      }),
      rejection_reasons_json: JSON.stringify([]),
      notes: 'test',
      created_at_ms: Date.now(),
    });
    repo.upsertSignal(buildSignal('signal-yield-board', 'AAPL'));
    repo.upsertAlphaShadowObservations([
      {
        id: 'alpha-shadow-yield-board',
        alpha_candidate_id: candidate.id,
        workflow_run_id: 'workflow-alpha-yield-board',
        signal_id: 'signal-yield-board',
        market: 'US',
        symbol: 'AAPL',
        shadow_action: 'APPROVE',
        alignment_score: 0.82,
        adjusted_confidence: 0.72,
        suggested_weight_multiplier: 1,
        realized_pnl_pct: 0.8,
        realized_source: 'paper',
        payload_json: JSON.stringify({}),
        created_at_ms: Date.now(),
        updated_at_ms: Date.now(),
      },
    ]);

    const summary = buildAlphaRegistrySummary(repo);
    const row = summary.hypothesis_yield_board.find(
      (item) => item.hypothesis_id === 'HYP-MOM-TEST',
    );

    expect(row).toBeTruthy();
    expect(row?.template_id).toBe('TMP-BREAKOUT-TEST');
    expect(row?.pass).toBe(1);
    expect(row?.promoted_or_live).toBe(1);
    expect(row?.replay_evaluated).toBe(1);
    expect(row?.realized_sample_size).toBe(1);
    expect(row?.yield_score).toBeGreaterThan(0.5);
  });

  it('queues and evaluates retest mutations from weak shadow outcomes during discovery', async () => {
    vi.stubEnv('NOVA_ALPHA_DISCOVERY_ENABLED', '1');
    vi.stubEnv('NOVA_ALPHA_DISCOVERY_MAX_CANDIDATES', '4');
    vi.stubEnv('NOVA_ALPHA_DISCOVERY_SEARCH_BUDGET', '1');
    vi.stubEnv('NOVA_ALPHA_DISCOVERY_MIN_ACCEPTANCE_SCORE', '0.95');

    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const parent = buildCandidate('alpha-shadow-feedback-parent');
    persistAlphaCandidate(repo, {
      candidate: parent,
      status: 'SHADOW',
      acceptanceScore: 0.8,
    });
    repo.insertAlphaEvaluation({
      id: 'alpha-eval-shadow-feedback-parent',
      alpha_candidate_id: parent.id,
      workflow_run_id: 'workflow-alpha-feedback-seed',
      backtest_run_id: 'alpha-backtest-feedback-seed',
      evaluation_status: 'PASS',
      acceptance_score: 0.8,
      metrics_json: JSON.stringify({
        correlation_to_active: 0.2,
        sharpe: 0.7,
        net_pnl: 0.05,
      }),
      rejection_reasons_json: JSON.stringify([]),
      notes: 'seed',
      created_at_ms: Date.now(),
    });
    repo.upsertSignals(
      Array.from({ length: 6 }).map((_, index) => buildSignal(`signal-feedback-${index}`, 'AAPL')),
    );
    repo.upsertAlphaShadowObservations(
      Array.from({ length: 6 }).map((_, index) => ({
        id: `shadow-feedback-${index}`,
        alpha_candidate_id: parent.id,
        workflow_run_id: 'workflow-alpha-feedback-seed',
        signal_id: `signal-feedback-${index}`,
        market: 'US',
        symbol: 'AAPL',
        shadow_action: 'APPROVE',
        alignment_score: 0.74,
        adjusted_confidence: 0.7,
        suggested_weight_multiplier: 1,
        realized_pnl_pct: -0.15,
        realized_source: 'paper',
        payload_json: JSON.stringify({}),
        created_at_ms: Date.now() + index,
        updated_at_ms: Date.now() + index,
      })),
    );

    const result = await runAlphaDiscoveryCycle({
      repo,
      userId: 'alpha-feedback-user',
      triggerType: 'manual',
      force: true,
    });
    const output = result as Record<string, any>;
    const children = repo
      .listAlphaCandidates({ limit: 120 })
      .filter((row) => row.parent_alpha_id === parent.id);

    expect(output.shadow_feedback_retest.registered.length).toBeGreaterThan(0);
    expect(output.shadow_feedback_retest.evaluated).toBeGreaterThan(0);
    expect(children.length).toBeGreaterThan(0);
    expect(
      children.some((row) =>
        String(row.metadata_json).includes('shadow_feedback:negative_expectancy'),
      ),
    ).toBe(true);
  });

  it('promotes passing shadow candidates to CANARY but not PROD by default', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const now = Date.now();

    const candidate = buildCandidate('alpha-shadow-pass');
    persistAlphaCandidate(repo, {
      candidate,
      status: 'SHADOW',
      acceptanceScore: 0.82,
    });
    repo.upsertSignals(
      Array.from({ length: 18 }).map((_, index) =>
        buildSignal(`signal-shadow-pass-${index}`, 'AAPL'),
      ),
    );
    repo.insertAlphaEvaluation({
      id: 'alpha-eval-pass',
      alpha_candidate_id: candidate.id,
      workflow_run_id: 'workflow-alpha-discovery-test',
      backtest_run_id: 'alpha-backtest-shadow-pass',
      evaluation_status: 'PASS',
      acceptance_score: 0.82,
      metrics_json: JSON.stringify({
        correlation_to_active: 0.24,
        sharpe: 0.92,
        net_pnl: 0.08,
      }),
      rejection_reasons_json: JSON.stringify([]),
      notes: 'passed',
      created_at_ms: now,
    });
    repo.upsertAlphaShadowObservations(
      Array.from({ length: 18 }).map((_, index) => ({
        id: `shadow-${index}`,
        alpha_candidate_id: candidate.id,
        workflow_run_id: 'workflow-alpha-shadow-test',
        signal_id: `signal-shadow-pass-${index}`,
        market: 'US',
        symbol: 'AAPL',
        shadow_action: 'APPROVE',
        alignment_score: 0.78,
        adjusted_confidence: 0.72,
        suggested_weight_multiplier: 1.04,
        realized_pnl_pct: index % 4 === 0 ? -0.2 : 0.9,
        realized_source: 'paper',
        payload_json: JSON.stringify({}),
        created_at_ms: now + index,
        updated_at_ms: now + index,
      })),
    );

    const review = reviewAlphaShadowCandidates({
      repo,
      thresholds: {
        minAcceptanceScore: 0.74,
        maxCorrelationToActive: 0.72,
        shadowAdmission: {
          minAcceptanceScore: 0.58,
          maxDrawdown: 0.28,
        },
        shadowPromotion: {
          minSampleSize: 16,
          minSharpe: 0.2,
          minExpectancy: 0.001,
          maxDrawdown: 0.25,
          minApprovalRate: 0.45,
          maxBacktestDegradation: 0.55,
        },
        retirement: {
          minExpectancy: -0.01,
          maxDrawdown: 0.3,
          decayStreakLimit: 4,
        },
        allowProdPromotion: false,
      },
    });

    expect(review.promoted_to_canary).toContain(candidate.id);
    expect(review.promoted_to_prod).toEqual([]);
    expect(repo.getAlphaCandidate(candidate.id)?.status).toBe('CANARY');
  });

  it('does not let blocked shadow rows drag expectancy below retirement thresholds', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const now = Date.now();

    const candidate = buildCandidate('alpha-shadow-noise-filter');
    persistAlphaCandidate(repo, {
      candidate,
      status: 'SHADOW',
      acceptanceScore: 0.78,
    });
    repo.insertAlphaEvaluation({
      id: 'alpha-eval-noise-filter',
      alpha_candidate_id: candidate.id,
      workflow_run_id: 'workflow-alpha-discovery-test',
      backtest_run_id: 'alpha-backtest-noise-filter',
      evaluation_status: 'PASS',
      acceptance_score: 0.78,
      metrics_json: JSON.stringify({
        correlation_to_active: 0.21,
        sharpe: 0.81,
        net_pnl: 0.07,
      }),
      rejection_reasons_json: JSON.stringify([]),
      notes: 'shadow candidate',
      created_at_ms: now,
    });
    repo.upsertSignals([
      ...Array.from({ length: 18 }).map((_, index) => buildSignal(`signal-block-${index}`, 'AAPL')),
      ...Array.from({ length: 6 }).map((_, index) =>
        buildSignal(`signal-approve-${index}`, 'AAPL'),
      ),
    ]);
    repo.upsertAlphaShadowObservations([
      ...Array.from({ length: 18 }).map((_, index) => ({
        id: `shadow-block-${index}`,
        alpha_candidate_id: candidate.id,
        workflow_run_id: 'workflow-alpha-shadow-test',
        signal_id: `signal-block-${index}`,
        market: 'US' as const,
        symbol: 'AAPL',
        shadow_action: 'BLOCK' as const,
        alignment_score: 0.46,
        adjusted_confidence: 0.64,
        suggested_weight_multiplier: 0,
        realized_pnl_pct: -1.2,
        realized_source: 'paper',
        payload_json: JSON.stringify({}),
        created_at_ms: now + index,
        updated_at_ms: now + index,
      })),
      ...Array.from({ length: 6 }).map((_, index) => ({
        id: `shadow-approve-${index}`,
        alpha_candidate_id: candidate.id,
        workflow_run_id: 'workflow-alpha-shadow-test',
        signal_id: `signal-approve-${index}`,
        market: 'US' as const,
        symbol: 'AAPL',
        shadow_action: 'APPROVE' as const,
        alignment_score: 0.78,
        adjusted_confidence: 0.72,
        suggested_weight_multiplier: 1.02,
        realized_pnl_pct: 0.8,
        realized_source: 'paper',
        payload_json: JSON.stringify({}),
        created_at_ms: now + 100 + index,
        updated_at_ms: now + 100 + index,
      })),
    ]);

    const summary = summarizeAlphaShadowPerformance(repo, candidate.id);
    expect(summary.sample_size).toBe(6);
    expect(summary.expectancy).toBeGreaterThan(0);

    const review = reviewAlphaShadowCandidates({
      repo,
      thresholds: {
        minAcceptanceScore: 0.7,
        maxCorrelationToActive: 0.72,
        shadowAdmission: {
          minAcceptanceScore: 0.58,
          maxDrawdown: 0.28,
        },
        shadowPromotion: {
          minSampleSize: 4,
          minSharpe: 0.2,
          minExpectancy: 0.001,
          maxDrawdown: 0.25,
          minApprovalRate: 0.45,
          maxBacktestDegradation: 0.55,
        },
        retirement: {
          minExpectancy: -0.002,
          maxDrawdown: 0.22,
          decayStreakLimit: 3,
        },
        allowProdPromotion: false,
      },
    });

    expect(review.retired).toEqual([]);
    expect(repo.getAlphaCandidate(candidate.id)?.status).toBe('SHADOW');
  });

  it('admits watch-level candidates into SHADOW through the relaxed shadow admission gate', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const now = Date.now();

    const candidate = buildCandidate('alpha-shadow-admission');
    persistAlphaCandidate(repo, {
      candidate,
      status: 'DRAFT',
      acceptanceScore: 0.6,
    });

    const evaluationId = 'alpha-eval-shadow-admission';
    const review = reviewAlphaBacktestOutcomes({
      repo,
      evaluated: [
        {
          candidate: {
            id: candidate.id,
            integration_path: 'signal_input',
          },
          evaluation: {
            id: evaluationId,
            alpha_candidate_id: candidate.id,
            workflow_run_id: 'workflow-alpha-discovery-test',
            backtest_run_id: 'alpha-backtest-shadow-admission',
            evaluation_status: 'WATCH',
            acceptance_score: 0.6,
            metrics_json: '{}',
            rejection_reasons_json: '[]',
            notes: 'watch but admissible',
            created_at_ms: now,
          },
          metrics: {
            correlation_to_active: 0.22,
            max_drawdown: 0.24,
            sharpe: 0.64,
            net_pnl: 0.032,
          },
          rejectionReasons: [],
          recommendedState: 'DRAFT',
        },
      ],
      thresholds: {
        minAcceptanceScore: 0.66,
        maxCorrelationToActive: 0.8,
        shadowAdmission: {
          minAcceptanceScore: 0.58,
          maxDrawdown: 0.28,
        },
        shadowPromotion: {
          minSampleSize: 12,
          minSharpe: 0.45,
          minExpectancy: 0.0015,
          maxDrawdown: 0.18,
          minApprovalRate: 0.45,
          maxBacktestDegradation: 0.45,
        },
        retirement: {
          minExpectancy: -0.002,
          maxDrawdown: 0.22,
          decayStreakLimit: 3,
        },
        allowProdPromotion: false,
      },
    });

    expect(review.accepted).toEqual([candidate.id]);
    expect(repo.getAlphaCandidate(candidate.id)?.status).toBe('SHADOW');
  });

  it('derives realized shadow pnl from OHLCV replay when no execution exists', () => {
    const db = new Database(':memory:');
    ensureSchema(db);
    const repo = new MarketRepository(db);
    const now = Date.now();

    const asset = repo.upsertAsset({
      symbol: 'AAPL',
      market: 'US',
      venue: 'TEST',
      status: 'ACTIVE',
    });
    repo.upsertOhlcvBars(
      asset.asset_id,
      '1d',
      [
        {
          ts_open: now - 10 * 86_400_000,
          open: '99',
          high: '101',
          low: '98.5',
          close: '100',
          volume: '1000000',
        },
        {
          ts_open: now - 9 * 86_400_000,
          open: '100',
          high: '102',
          low: '99.2',
          close: '101.2',
          volume: '1000000',
        },
        {
          ts_open: now - 8 * 86_400_000,
          open: '101.2',
          high: '104.6',
          low: '100.8',
          close: '104.1',
          volume: '1000000',
        },
        ...buildBars(now - 7 * 86_400_000, 8, 105),
      ],
      'TEST',
    );

    const candidate = buildCandidate('alpha-shadow-replay');
    persistAlphaCandidate(repo, {
      candidate,
      status: 'SHADOW',
      acceptanceScore: 0.64,
    });

    const signal = buildSignal('signal-shadow-replay', 'AAPL');
    signal.created_at = new Date(now - 8 * 86_400_000).toISOString();
    signal.expires_at = new Date(now - 2 * 86_400_000).toISOString();
    signal.status = 'EXPIRED';
    signal.entry_zone.low = 100;
    signal.entry_zone.high = 101;
    signal.stop_loss.price = 97;
    signal.take_profit_levels[0].price = 104;
    repo.upsertSignal(signal);

    const result = runAlphaShadowCycle({
      repo,
      workflowRunId: 'workflow-alpha-shadow-replay',
      userId: 'guest-default',
    });

    expect(result.candidates_processed).toBe(1);
    const summary = summarizeAlphaShadowPerformance(repo, candidate.id);
    expect(summary.sample_size).toBe(1);
    expect(summary.expectancy).not.toBeNull();

    const rows = repo.listAlphaShadowObservations({
      alphaCandidateId: candidate.id,
      signalId: signal.id,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.realized_source).toBe('ohlcv_replay');
    expect(Number(rows[0]?.realized_pnl_pct)).toBeGreaterThan(0);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as publicTodayDecisionService from '../src/server/public/todayDecisionService.js';
import {
  getDecisionSnapshot,
  getRuntimeState,
  getRuntimeStateResponse,
  shouldUsePublicDecisionFallback,
} from '../src/server/api/queries.js';
import { createBrokerAdapter } from '../src/server/connect/adapters.js';

describe('api runtime state', () => {
  afterEach(() => {
    delete process.env.NOVA_FORCE_PUBLIC_RUNTIME_FALLBACK;
    vi.restoreAllMocks();
  });

  it('serves runtime state with transparency metadata', async () => {
    const res = getRuntimeState({
      userId: 'guest-default',
      market: 'US',
      assetClass: 'US_STOCK',
    });

    expect(res).toHaveProperty('source_status');
    expect(res).toHaveProperty('data_transparency');
    expect(res.data).toHaveProperty('signals');
    expect(res.data).toHaveProperty('evidence');
    expect(res.data).toHaveProperty('performance');
    expect(res.data).toHaveProperty('decision');
    expect(res.data).toHaveProperty('membership');
    expect(res.data).toHaveProperty('manual');
    expect(Array.isArray(res.data.evidence?.top_signals)).toBe(true);
    expect(typeof res.data.config?.runtime?.api_checks?.signal_count).toBe('number');
    expect(res.data.decision).toHaveProperty('ranked_action_cards');
    expect(res.data.decision).toHaveProperty('risk_state');
    expect(res.data.decision).toHaveProperty('summary');
    if (res.data_transparency?.data_status === 'INSUFFICIENT_DATA') {
      expect(res.data?.velocity?.source_label).toBe('INSUFFICIENT_DATA');
      expect(res.data?.config?.source_label).toBe('INSUFFICIENT_DATA');
    }
  });

  it('falls back to public live scan cards when runtime data is unavailable', async () => {
    process.env.NOVA_FORCE_PUBLIC_RUNTIME_FALLBACK = '1';
    vi.spyOn(publicTodayDecisionService, 'getPublicTodayDecision').mockResolvedValue({
      as_of: '2026-03-24T00:00:00.000Z',
      source_status: 'MODEL_DERIVED',
      data_status: 'MODEL_DERIVED',
      evidence_mode: 'LIVE_PUBLIC_SCAN',
      performance_mode: 'UNAVAILABLE',
      today_call: {
        code: 'TRADE',
        headline: 'Fresh signals are live.',
        subtitle: 'AAPL is pulling back into trend support.',
      },
      risk_state: {
        posture: 'ATTACK',
        summary: 'Fresh signals are live.',
        user_message: 'Backdrop supports selective risk.',
      },
      ranked_action_cards: [
        {
          action_id: 'action-public-aapl',
          signal_id: 'public-aapl',
          symbol: 'AAPL',
          action_label: 'Open new risk',
          eligible: true,
          signal_payload: {
            signal_id: 'public-aapl',
            symbol: 'AAPL',
            market: 'US',
            asset_class: 'US_STOCK',
            direction: 'LONG',
            confidence: 0.71,
            score: 82,
            strategy_id: 'TREND_PULLBACK',
            entry_zone: { low: 200, high: 202 },
            stop_loss: { price: 196 },
            invalidation_level: 196,
            take_profit_levels: [{ price: 208, size_pct: 1 }],
            position_advice: { position_pct: 8 },
            explain_bullets: ['Public live scan fallback'],
            created_at: '2026-03-24T00:00:00.000Z',
            generated_at: '2026-03-24T00:00:00.000Z',
            freshness_label: 'live',
            status: 'NEW',
            source_status: 'MODEL_DERIVED',
            data_status: 'MODEL_DERIVED',
            source_label: 'MODEL_DERIVED',
          },
        },
      ],
      top_action_id: 'action-public-aapl',
      summary: {
        today_call: {
          code: 'TRADE',
          headline: 'Fresh signals are live.',
          subtitle: 'AAPL is pulling back into trend support.',
        },
      },
      audit: {
        candidate_count: 1,
        actionable_count: 1,
        strategy_backed_count: 1,
        publishable_count: 1,
        created_for_user: 'runtime-fallback-test',
      },
    } as any);

    const res = await getRuntimeStateResponse({
      userId: `runtime-fallback-test-${Date.now()}`,
      market: 'US',
      assetClass: 'US_STOCK',
    });

    expect(res.data.decision.today_call.code).toBe('TRADE');
    expect((res.data.signals[0] as { symbol?: string } | undefined)?.symbol).toBe('AAPL');
  });

  it('uses the same public fallback for decision snapshots without holdings', async () => {
    process.env.NOVA_FORCE_PUBLIC_RUNTIME_FALLBACK = '1';
    vi.spyOn(publicTodayDecisionService, 'getPublicTodayDecision').mockResolvedValue({
      as_of: '2026-03-24T00:00:00.000Z',
      source_status: 'MODEL_DERIVED',
      data_status: 'MODEL_DERIVED',
      evidence_mode: 'LIVE_PUBLIC_SCAN',
      performance_mode: 'UNAVAILABLE',
      today_call: {
        code: 'TRADE',
        headline: 'Fresh signals are live.',
        subtitle: 'MSFT is reclaiming trend support.',
      },
      risk_state: {
        posture: 'ATTACK',
        summary: 'Fresh signals are live.',
        user_message: 'Backdrop supports selective risk.',
      },
      ranked_action_cards: [],
      top_action_id: null,
      summary: {
        today_call: {
          code: 'TRADE',
          headline: 'Fresh signals are live.',
          subtitle: 'MSFT is reclaiming trend support.',
        },
      },
      audit: {
        candidate_count: 1,
        actionable_count: 1,
        strategy_backed_count: 1,
        publishable_count: 1,
        created_for_user: 'decision-fallback-test',
      },
    } as any);

    const decision = await getDecisionSnapshot({
      userId: `decision-fallback-test-${Date.now()}`,
      market: 'US',
      assetClass: 'US_STOCK',
    });

    expect((decision as { today_call?: { code?: string } }).today_call?.code).toBe('TRADE');
  });

  it('falls back when runtime is DB-backed but still has no displayable signal cards', () => {
    expect(
      shouldUsePublicDecisionFallback({
        sourceStatus: 'DB_BACKED',
        signalCount: 0,
        decision: {
          today_call: {
            code: 'WAIT',
          },
          ranked_action_cards: [],
        },
      }),
    ).toBe(true);
  });

  it('keeps the local runtime when decision action cards already carry signal payloads', () => {
    expect(
      shouldUsePublicDecisionFallback({
        sourceStatus: 'DB_BACKED',
        signalCount: 0,
        decision: {
          today_call: {
            code: 'WAIT',
          },
          ranked_action_cards: [
            {
              signal_payload: {
                signal_id: 'keep-local-signal',
                symbol: 'AAPL',
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('serves honest disconnected broker snapshot when not configured', async () => {
    process.env.ALPACA_API_KEY = '';
    process.env.ALPACA_API_SECRET = '';
    const adapter = createBrokerAdapter('ALPACA');
    const snapshot = await adapter.fetchSnapshot();

    expect(snapshot.status).toBe('DISCONNECTED');
    expect(snapshot.buying_power).toBeNull();
    expect(Array.isArray(snapshot.positions)).toBe(true);
    expect(snapshot.positions).toHaveLength(0);
  });
});

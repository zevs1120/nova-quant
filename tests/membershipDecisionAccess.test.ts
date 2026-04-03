import { describe, expect, it } from 'vitest';
import {
  applyMembershipAccessToDecision,
  applyMembershipAccessToRuntimeState,
} from '../src/server/membership/service.js';

function cards(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    action_id: `a-${i}`,
    signal_payload: { symbol: `S${i}` },
  }));
}

/** Narrow return shape for assertions (service returns Record spread + membership_gate). */
type GatedLike = {
  ranked_action_cards?: unknown[];
  membership_gate?: { hidden_action_cards?: number; total_action_cards?: number };
};

type RuntimeClipped = {
  data?: { decision?: { ranked_action_cards?: unknown[] } };
};

describe('applyMembershipAccessToDecision', () => {
  it('returns null for null decision', () => {
    expect(applyMembershipAccessToDecision({ decision: null, currentPlan: 'free' })).toBe(null);
  });

  it('returns null for undefined decision (same as null)', () => {
    expect(applyMembershipAccessToDecision({ decision: undefined, currentPlan: 'free' })).toBe(
      null,
    );
  });

  it('returns non-object primitives unchanged', () => {
    expect(applyMembershipAccessToDecision({ decision: 'x' as any, currentPlan: 'free' })).toBe(
      'x',
    );
  });

  it('clips free plan to three cards and sets gate metadata', () => {
    const decision = { ranked_action_cards: cards(5), foo: 1 };
    const next = applyMembershipAccessToDecision({ decision, currentPlan: 'free' });
    expect(next?.ranked_action_cards).toHaveLength(3);
    expect(next?.membership_gate).toMatchObject({
      current_plan: 'free',
      today_card_limit: 3,
      total_action_cards: 5,
      hidden_action_cards: 2,
    });
    expect(next?.foo).toBe(1);
  });

  it('keeps full decision for lite (unlimited today cards)', () => {
    const decision = { ranked_action_cards: cards(4) };
    const next = applyMembershipAccessToDecision({ decision, currentPlan: 'lite' });
    expect(next).toBe(decision);
  });

  it('keeps full decision for pro', () => {
    const decision = { ranked_action_cards: cards(10) };
    const next = applyMembershipAccessToDecision({ decision, currentPlan: 'pro' });
    expect(next).toBe(decision);
  });

  it('treats bogus plan as free for clipping', () => {
    const decision = { ranked_action_cards: cards(4) };
    const next = applyMembershipAccessToDecision({ decision, currentPlan: 'unknown-tier' });
    expect(next?.ranked_action_cards).toHaveLength(3);
  });

  it('merges existing membership_gate fields', () => {
    const decision = {
      ranked_action_cards: cards(2),
      membership_gate: { custom: true },
    };
    const next = applyMembershipAccessToDecision({ decision, currentPlan: 'free' });
    expect(next?.membership_gate).toMatchObject({ custom: true, hidden_action_cards: 0 });
  });

  it('handles zero cards', () => {
    const decision = { ranked_action_cards: [] };
    const next = applyMembershipAccessToDecision({ decision, currentPlan: 'free' });
    expect(next?.ranked_action_cards).toEqual([]);
    expect((next as GatedLike).membership_gate?.hidden_action_cards).toBe(0);
  });

  it('ignores non-array ranked_action_cards as empty', () => {
    const decision = { ranked_action_cards: 'bad' as any };
    const next = applyMembershipAccessToDecision({ decision, currentPlan: 'free' });
    expect(next?.ranked_action_cards).toEqual([]);
    expect((next as GatedLike).membership_gate?.total_action_cards).toBe(0);
  });
});

describe('applyMembershipAccessToRuntimeState', () => {
  it('returns null runtime as-is', () => {
    expect(applyMembershipAccessToRuntimeState({ runtime: null, currentPlan: 'free' })).toBe(null);
  });

  it('returns runtime without data unchanged', () => {
    const runtime = { meta: 1 };
    expect(applyMembershipAccessToRuntimeState({ runtime, currentPlan: 'free' })).toBe(runtime);
  });

  it('returns runtime when data is not an object', () => {
    const runtime = { data: 'x' };
    expect(applyMembershipAccessToRuntimeState({ runtime, currentPlan: 'free' })).toBe(runtime);
  });

  it('clips nested decision inside runtime.data', () => {
    const runtime = {
      data: {
        decision: { ranked_action_cards: cards(5) },
      },
    };
    const next = applyMembershipAccessToRuntimeState({ runtime, currentPlan: 'free' });
    expect((next as RuntimeClipped).data?.decision?.ranked_action_cards).toHaveLength(3);
  });
});

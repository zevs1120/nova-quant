import { describe, expect, it } from 'vitest';
import {
  getMembershipLimits,
  getRemainingAskNova,
  getTodayCardLimit,
  isPortfolioAwareRequest,
  membershipPlanRank,
  membershipUsageDay,
  normalizeMembershipPlan,
} from '../src/utils/membership.js';

describe('normalizeMembershipPlan', () => {
  it.each([
    ['free', 'free'],
    ['Lite', 'lite'],
    [' PRO ', 'pro'],
    ['unknown', 'free'],
    ['', 'free'],
  ])('%j → %s', (input, out) => {
    expect(normalizeMembershipPlan(input)).toBe(out);
  });
});

describe('membershipPlanRank', () => {
  it('orders free < lite < pro', () => {
    expect(membershipPlanRank('free')).toBeLessThan(membershipPlanRank('lite'));
    expect(membershipPlanRank('lite')).toBeLessThan(membershipPlanRank('pro'));
  });
});

describe('getTodayCardLimit', () => {
  it('limits only free tier', () => {
    expect(getTodayCardLimit('free')).toBe(3);
    expect(getTodayCardLimit('lite')).toBe(null);
    expect(getTodayCardLimit('pro')).toBe(null);
  });
});

describe('getMembershipLimits', () => {
  it('exposes ask nova caps', () => {
    expect(getMembershipLimits('free').askNovaDaily).toBe(3);
    expect(getMembershipLimits('lite').askNovaDaily).toBe(20);
    expect(getMembershipLimits('pro').askNovaDaily).toBe(null);
  });

  it('gates broker and portfolio AI by plan', () => {
    expect(getMembershipLimits('free').brokerHandoff).toBe(false);
    expect(getMembershipLimits('lite').brokerHandoff).toBe(true);
    expect(getMembershipLimits('lite').portfolioAi).toBe(false);
    expect(getMembershipLimits('pro').portfolioAi).toBe(true);
  });
});

describe('getRemainingAskNova', () => {
  const today = membershipUsageDay();

  it('subtracts usage for free', () => {
    expect(getRemainingAskNova('free', { askNovaUsed: 1, day: today })).toBe(2);
  });

  it('returns null for unlimited plans', () => {
    expect(getRemainingAskNova('pro', { askNovaUsed: 999 })).toBe(null);
  });

  it('floors at zero', () => {
    expect(getRemainingAskNova('free', { askNovaUsed: 10, day: today })).toBe(0);
  });
});

describe('isPortfolioAwareRequest', () => {
  it('detects page context', () => {
    expect(isPortfolioAwareRequest('hello', { page: 'holdings' })).toBe(true);
    expect(isPortfolioAwareRequest('hello', { page: 'portfolio' })).toBe(true);
    expect(isPortfolioAwareRequest('hello', { page: 'weekly' })).toBe(true);
  });

  it('detects focus and target hints', () => {
    expect(isPortfolioAwareRequest('x', { focus: 'portfolio' })).toBe(true);
    expect(isPortfolioAwareRequest('x', { target: 'holdings' })).toBe(true);
  });

  it.each([
    ['should I rebalance my holdings?', true],
    ['portfolio risk check', true],
    ['持仓怎么看', true],
    ['random market trivia', false],
  ])('%j → %s', (msg, expected) => {
    expect(isPortfolioAwareRequest(msg, {})).toBe(expected);
  });
});

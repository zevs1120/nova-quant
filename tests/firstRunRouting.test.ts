import { describe, expect, it } from 'vitest';
import { mapEntryIntent, resolveFirstRunTarget } from '../src/utils/firstRunRouting.js';

describe('firstRunRouting.mapEntryIntent', () => {
  it('maps have_holdings to manage_holdings', () => {
    expect(mapEntryIntent('have_holdings')).toEqual({
      goal: 'manage_holdings',
      currentState: 'have_holdings',
    });
  });

  it('maps just_exploring to understand_market', () => {
    expect(mapEntryIntent('just_exploring')).toEqual({
      goal: 'understand_market',
      currentState: 'just_exploring',
    });
  });

  it('maps ready_to_trade and default to daily_calls', () => {
    expect(mapEntryIntent('ready_to_trade')).toEqual({
      goal: 'daily_calls',
      currentState: 'ready_to_trade',
    });
    expect(mapEntryIntent('')).toEqual({
      goal: 'daily_calls',
      currentState: 'ready_to_trade',
    });
    expect(mapEntryIntent('unknown')).toEqual({
      goal: 'daily_calls',
      currentState: 'ready_to_trade',
    });
  });
});

describe('firstRunRouting.resolveFirstRunTarget', () => {
  it('sends holdings path to my', () => {
    expect(resolveFirstRunTarget('manage_holdings', undefined)).toBe('my');
    expect(resolveFirstRunTarget(undefined, 'have_holdings')).toBe('my');
  });

  it('sends explore path to browse', () => {
    expect(resolveFirstRunTarget('understand_market', undefined)).toBe('browse');
    expect(resolveFirstRunTarget(undefined, 'just_exploring')).toBe('browse');
  });

  it('defaults to today for daily_calls / ready_to_trade', () => {
    expect(resolveFirstRunTarget('daily_calls', 'ready_to_trade')).toBe('today');
    expect(resolveFirstRunTarget(undefined, undefined)).toBe('today');
  });

  it('goal manage_holdings wins over unrelated currentState', () => {
    expect(resolveFirstRunTarget('manage_holdings', 'just_exploring')).toBe('my');
  });

  it('currentState have_holdings wins over unrelated goal', () => {
    expect(resolveFirstRunTarget('daily_calls', 'have_holdings')).toBe('my');
  });
});

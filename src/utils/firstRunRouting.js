/**
 * First-run setup intent → profile fields used when completing `FirstRunSetupFlow`.
 * @param {string} entryIntent
 * @returns {{ goal: string, currentState: string }}
 */
export function mapEntryIntent(entryIntent) {
  if (entryIntent === 'have_holdings') {
    return { goal: 'manage_holdings', currentState: 'have_holdings' };
  }
  if (entryIntent === 'just_exploring') {
    return { goal: 'understand_market', currentState: 'just_exploring' };
  }
  return { goal: 'daily_calls', currentState: 'ready_to_trade' };
}

/**
 * Where to land after first-run completes, from stored goal / state.
 * @param {string | undefined} goal
 * @param {string | undefined} currentState
 * @returns {'today' | 'browse' | 'my'}
 */
export function resolveFirstRunTarget(goal, currentState) {
  if (currentState === 'have_holdings' || goal === 'manage_holdings') {
    return 'my';
  }
  if (currentState === 'just_exploring' || goal === 'understand_market') {
    return 'browse';
  }
  return 'today';
}

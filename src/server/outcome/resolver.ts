/**
 * Outcome Resolver — closes the decision → outcome feedback loop.
 *
 * Joins `decision_snapshots` with subsequent OHLCV prices to automatically
 * grade each action recommendation against real market outcomes.
 */
import type { MarketRepository } from '../db/repository.js';
import type { Market, AssetClass, OutcomeReviewRecord } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OutcomeVerdict = 'HIT' | 'MISS' | 'INCONCLUSIVE' | 'PENDING';

export interface ForwardReturn {
  horizon: number; // T+N trading bars
  close: number | null;
  return_pct: number | null;
}

export interface OutcomeEntry {
  decision_snapshot_id: string;
  snapshot_date: string;
  action_id: string;
  symbol: string | null;
  market: Market | 'ALL';
  asset_class: AssetClass | 'ALL';
  direction: string;
  conviction: number;
  entry_zone: { low: number | null; high: number | null } | null;
  forward_returns: ForwardReturn[];
  verdict: OutcomeVerdict;
  verdict_return_pct: number | null;
  verdict_horizon: number;
  summary: string;
}

export interface OutcomeStats {
  total: number;
  resolved: number;
  pending: number;
  hit: number;
  miss: number;
  inconclusive: number;
  hit_rate: number | null; // as fraction [0, 1]
  avg_return_t1: number | null;
  avg_return_t3: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HORIZONS = [1, 3, 5]; // T+1, T+3, T+5 (trading bars, not calendar days)
const MAX_HORIZON = Math.max(...HORIZONS);
const HIT_THRESHOLD = 0.003; // ±0.3% to classify
const MS_PER_DAY = 86_400_000;
const VERDICT_HORIZON = 3; // primary verdict uses T+3
const SKIP_ACTIONS = new Set(['no_action', 'wait', 'defensive_hold']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDateToMs(dateStr: string): number {
  const ts = Date.parse(dateStr);
  return Number.isFinite(ts) ? ts : 0;
}

function dateToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function computeForwardReturn(baseClose: number, futureClose: number, direction: string): number {
  if (!baseClose || !futureClose) return 0;
  const rawReturn = (futureClose - baseClose) / baseClose;
  return direction === 'SHORT' ? -rawReturn : rawReturn;
}

function classifyVerdict(returnPct: number | null): OutcomeVerdict {
  if (returnPct === null) return 'PENDING';
  if (returnPct >= HIT_THRESHOLD) return 'HIT';
  if (returnPct <= -HIT_THRESHOLD) return 'MISS';
  return 'INCONCLUSIVE';
}

function buildSummary(
  symbol: string,
  direction: string,
  verdict: OutcomeVerdict,
  returnPct: number | null,
  horizon: number,
): string {
  if (verdict === 'PENDING') {
    return `${symbol} ${direction}: awaiting T+${horizon} price data.`;
  }
  const pct = returnPct !== null ? `${(returnPct * 100).toFixed(2)}%` : '--';
  const icon = verdict === 'HIT' ? '✅' : verdict === 'MISS' ? '❌' : '⬜';
  return `${icon} ${symbol} ${direction} T+${horizon}: ${pct}`;
}

// ---------------------------------------------------------------------------
// Core resolver
// ---------------------------------------------------------------------------

interface ActionFromSnapshot {
  action_id: string;
  symbol: string | null;
  market: Market | 'ALL';
  asset_class: AssetClass | 'ALL';
  direction: string;
  conviction: number;
  action: string;
  entry_zone: { low: number | null; high: number | null } | null;
}

function extractActions(actionsJson: string): ActionFromSnapshot[] {
  try {
    const cards = JSON.parse(actionsJson);
    if (!Array.isArray(cards)) return [];
    return cards
      .filter((card: Record<string, unknown>) => {
        const action = String(card?.action || card?.portfolio_intent || '').toLowerCase();
        return !SKIP_ACTIONS.has(action) && card?.symbol;
      })
      .map((card: Record<string, unknown>) => ({
        action_id: String(card.action_id || ''),
        symbol: String(card.symbol || ''),
        market: (card.market || 'ALL') as Market | 'ALL',
        asset_class: (card.asset_class || 'ALL') as AssetClass | 'ALL',
        direction: String(card.direction || card.portfolio_intent || 'LONG').toUpperCase(),
        conviction: Number(card.confidence || card.conviction || 0),
        action: String(card.action || card.portfolio_intent || ''),
        entry_zone: card.entry_zone as { low: number | null; high: number | null } | null,
      }));
  } catch {
    return [];
  }
}

/**
 * Resolve outcomes for all decision snapshots on `targetDate`.
 */
export function resolveOutcomesForDate(
  repo: MarketRepository,
  targetDate: string,
  userId: string,
): OutcomeEntry[] {
  const snapshots = repo.listDecisionSnapshots({
    userId,
    limit: 50,
  });
  const matched = snapshots.filter((s) => s.snapshot_date === targetDate);
  if (!matched.length) return [];

  const results: OutcomeEntry[] = [];
  const snapshotDateMs = parseDateToMs(targetDate);
  if (!snapshotDateMs) return [];

  for (const snapshot of matched) {
    const actions = extractActions(snapshot.actions_json);
    for (const action of actions) {
      if (!action.symbol) continue;

      // Resolve asset → OHLCV
      const marketForLookup =
        action.market === 'ALL'
          ? snapshot.market === 'ALL'
            ? 'US'
            : snapshot.market
          : action.market;
      const asset = repo.getAssetBySymbol(marketForLookup, action.symbol);
      if (!asset) {
        // No asset record — cannot resolve
        results.push({
          decision_snapshot_id: snapshot.id,
          snapshot_date: targetDate,
          action_id: action.action_id,
          symbol: action.symbol,
          market: action.market,
          asset_class: action.asset_class,
          direction: action.direction,
          conviction: action.conviction,
          entry_zone: action.entry_zone,
          forward_returns: HORIZONS.map((h) => ({ horizon: h, close: null, return_pct: null })),
          verdict: 'PENDING',
          verdict_return_pct: null,
          verdict_horizon: VERDICT_HORIZON,
          summary: buildSummary(action.symbol, action.direction, 'PENDING', null, VERDICT_HORIZON),
        });
        continue;
      }

      // Fetch the base bar (snapshot date) plus subsequent trading bars.
      // We query bars starting from the snapshot date, sorted by ts_open ASC,
      // and take the first MAX_HORIZON + 1 bars. Index 0 = base bar,
      // index N = T+N trading bar (skips weekends/holidays automatically).
      const allBars = repo.getOhlcv({
        assetId: asset.asset_id,
        timeframe: '1d',
        start: snapshotDateMs,
        limit: MAX_HORIZON + 1,
      });

      const baseClose = allBars.length ? Number(allBars[0].close) : null;

      // Build forward returns using bar index (trading-day semantics)
      const forwardReturns: ForwardReturn[] = HORIZONS.map((horizon) => {
        const bar = allBars[horizon]; // Index N = T+N trading bar
        const futureClose = bar ? Number(bar.close) : null;
        if (baseClose === null || futureClose === null) {
          return { horizon, close: futureClose, return_pct: null };
        }
        return {
          horizon,
          close: futureClose,
          return_pct: computeForwardReturn(baseClose, futureClose, action.direction),
        };
      });

      // Primary verdict from T+3
      const verdictReturn = forwardReturns.find((r) => r.horizon === VERDICT_HORIZON);
      const verdict = classifyVerdict(verdictReturn?.return_pct ?? null);
      const verdictPct = verdictReturn?.return_pct ?? null;

      const entry: OutcomeEntry = {
        decision_snapshot_id: snapshot.id,
        snapshot_date: targetDate,
        action_id: action.action_id,
        symbol: action.symbol,
        market: action.market,
        asset_class: action.asset_class,
        direction: action.direction,
        conviction: action.conviction,
        entry_zone: action.entry_zone,
        forward_returns: forwardReturns,
        verdict,
        verdict_return_pct: verdictPct,
        verdict_horizon: VERDICT_HORIZON,
        summary: buildSummary(
          action.symbol,
          action.direction,
          verdict,
          verdictPct,
          VERDICT_HORIZON,
        ),
      };
      results.push(entry);

      // Persist to outcome_reviews
      const now = Date.now();
      const reviewId = `outcome-${snapshot.id}-${action.action_id}`;
      const reviewRecord: OutcomeReviewRecord = {
        id: reviewId,
        user_id: userId,
        market: action.market,
        asset_class: action.asset_class,
        decision_snapshot_id: snapshot.id,
        action_id: action.action_id,
        review_kind: verdict === 'MISS' ? 'FAILURE' : 'OUTCOME',
        score: verdictPct,
        verdict,
        summary: entry.summary,
        payload_json: JSON.stringify({
          symbol: action.symbol,
          direction: action.direction,
          conviction: action.conviction,
          entry_zone: action.entry_zone,
          forward_returns: forwardReturns,
          verdict_horizon: VERDICT_HORIZON,
          base_close: baseClose,
          snapshot_date: targetDate,
          resolved_at: new Date().toISOString(),
        }),
        created_at_ms: now,
        updated_at_ms: now,
      };
      repo.upsertOutcomeReview(reviewRecord);
    }
  }

  return results;
}

/**
 * Resolve outcomes for the last `lookbackDays` days.
 */
export function resolveRecentOutcomes(
  repo: MarketRepository,
  userId: string,
  lookbackDays = 14,
): { resolved: number; dates: string[] } {
  const now = Date.now();
  const dates: string[] = [];
  let resolved = 0;

  for (let d = lookbackDays; d >= 1; d--) {
    const dateStr = dateToIso(now - d * MS_PER_DAY);
    dates.push(dateStr);
    const entries = resolveOutcomesForDate(repo, dateStr, userId);
    resolved += entries.length;
  }

  return { resolved, dates };
}

/**
 * Load all resolved outcome reviews and compute aggregate stats.
 */
export function getOutcomeSummaryStats(
  repo: MarketRepository,
  userId: string,
  limit = 100,
): { outcomes: OutcomeEntry[]; stats: OutcomeStats } {
  const reviews = repo.listOutcomeReviews({ userId, limit });

  const outcomes: OutcomeEntry[] = reviews.map((r) => {
    const payload = safeParseJson(r.payload_json);
    const forwardReturns: ForwardReturn[] = Array.isArray(payload.forward_returns)
      ? payload.forward_returns
      : [];

    return {
      decision_snapshot_id: r.decision_snapshot_id,
      snapshot_date: payload.snapshot_date ? String(payload.snapshot_date) : '',
      action_id: r.action_id || '',
      symbol: payload.symbol ? String(payload.symbol) : null,
      market: r.market,
      asset_class: r.asset_class,
      direction: String(payload.direction || 'LONG'),
      conviction: Number(payload.conviction || 0),
      entry_zone: (payload.entry_zone as OutcomeEntry['entry_zone']) || null,
      forward_returns: forwardReturns,
      verdict: (r.verdict || 'PENDING') as OutcomeVerdict,
      verdict_return_pct: r.score,
      verdict_horizon: Number(payload.verdict_horizon || VERDICT_HORIZON),
      summary: r.summary,
    };
  });

  // Compute stats
  const resolved = outcomes.filter((o) => o.verdict !== 'PENDING');
  const hit = resolved.filter((o) => o.verdict === 'HIT').length;
  const miss = resolved.filter((o) => o.verdict === 'MISS').length;
  const inconclusive = resolved.filter((o) => o.verdict === 'INCONCLUSIVE').length;
  const pending = outcomes.length - resolved.length;

  const t1Returns = outcomes
    .map((o) => o.forward_returns.find((r) => r.horizon === 1)?.return_pct)
    .filter((v): v is number => v !== null && v !== undefined);
  const t3Returns = outcomes
    .map((o) => o.forward_returns.find((r) => r.horizon === 3)?.return_pct)
    .filter((v): v is number => v !== null && v !== undefined);

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  return {
    outcomes,
    stats: {
      total: outcomes.length,
      resolved: resolved.length,
      pending,
      hit,
      miss,
      inconclusive,
      hit_rate: resolved.length > 0 ? hit / resolved.length : null,
      avg_return_t1: avg(t1Returns),
      avg_return_t3: avg(t3Returns),
    },
  };
}

function safeParseJson(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

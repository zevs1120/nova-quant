import { createHash } from 'node:crypto';
import { getPublicBrowseAssetChart, queryPublicOhlcv } from './browseService.js';
import type { AssetClass, Market } from '../types.js';

type ScanStats = {
  symbol: string;
  market: Market;
  closes: number[];
  highs: number[];
  lows: number[];
  latest: number;
  previous: number;
  ma10: number;
  ma20: number;
  ma50: number;
  ret1d: number;
  ret5d: number;
  ret20d: number;
  high20: number;
  low20: number;
  rangePct14: number;
  asOf: string;
};

type CandidateCard = {
  action_id: string;
  signal_id: string;
  symbol: string;
  market: Market;
  asset_class: AssetClass;
  action: 'open_new_risk' | 'watch_only';
  action_label: string;
  portfolio_intent: 'open_new_risk' | 'watch_only';
  confidence: number;
  calibrated_confidence: number;
  conviction_label: 'High' | 'Medium' | 'Low';
  time_horizon: string;
  time_horizon_days: number;
  brief_why_now: string;
  brief_caution: string;
  risk_note: string;
  eligible: boolean;
  ranking_score: number;
  recommended_position_pct: number;
  governor: {
    governor_mode: 'NORMAL' | 'CAUTION' | 'DERISK' | 'BLOCKED';
    allowed: boolean;
    size_multiplier: number;
    risk_budget_remaining: number;
    block_reason: string | null;
    reasons: string[];
    overlays: string[];
  };
  evidence_lineage: {
    display_mode: string;
    performance_mode: string;
    validation_mode: string;
  };
  entry_zone: { low: number; high: number };
  stop_loss: { price: number };
  take_profit: { price: number };
  strategy_source: string;
  strategy_backed: true;
  risk_bucket: 'NORMAL' | 'CAUTION' | 'DERISK' | 'BLOCKED';
  publication_status: 'ACTIONABLE' | 'WATCH';
  publication_reason: string | null;
  source_status: 'MODEL_DERIVED';
  data_status: 'MODEL_DERIVED';
  source_label: 'MODEL_DERIVED';
  signal_payload: Record<string, unknown>;
  evidence_bundle: Record<string, unknown>;
};

const PUBLIC_STOCK_UNIVERSE = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'SPY', 'QQQ', 'AMZN', 'META', 'NFLX', 'COIN', 'PLTR', 'MSTR'];
const PUBLIC_CRYPTO_UNIVERSE = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT'];
const PUBLIC_MARKET_PROXIES = [
  { symbol: 'SPY', market: 'US' as const },
  { symbol: 'QQQ', market: 'US' as const },
  { symbol: 'BTCUSDT', market: 'CRYPTO' as const }
];

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function meanOfLast(values: number[], count: number) {
  const slice = values.slice(-count);
  return slice.length ? average(slice) : 0;
}

function buildStats(symbol: string, market: Market, rows: Array<{ close: number | null; high: number | null; low: number | null; ts_open: number }>): ScanStats | null {
  const closes = rows.map((row) => row.close).filter((value): value is number => Number.isFinite(value));
  const highs = rows.map((row) => row.high).filter((value): value is number => Number.isFinite(value));
  const lows = rows.map((row) => row.low).filter((value): value is number => Number.isFinite(value));
  if (closes.length < 55 || highs.length < 20 || lows.length < 20) return null;
  const latest = closes[closes.length - 1];
  const previous = closes[closes.length - 2];
  const ma10 = meanOfLast(closes, 10);
  const ma20 = meanOfLast(closes, 20);
  const ma50 = meanOfLast(closes, 50);
  const high20 = Math.max(...highs.slice(-20));
  const low20 = Math.min(...lows.slice(-20));
  const ret1d = previous ? (latest - previous) / previous : 0;
  const ret5Base = closes[closes.length - 6];
  const ret20Base = closes[closes.length - 21];
  const ret5d = ret5Base ? (latest - ret5Base) / ret5Base : 0;
  const ret20d = ret20Base ? (latest - ret20Base) / ret20Base : 0;
  const rangePct14 = average(
    rows.slice(-14).map((row) => {
      const high = row.high ?? row.close ?? 0;
      const low = row.low ?? row.close ?? 0;
      const close = row.close ?? 1;
      return close ? (high - low) / close : 0;
    })
  );
  return {
    symbol,
    market,
    closes,
    highs,
    lows,
    latest,
    previous,
    ma10,
    ma20,
    ma50,
    ret1d,
    ret5d,
    ret20d,
    high20,
    low20,
    rangePct14,
    asOf: new Date(rows[rows.length - 1].ts_open).toISOString()
  };
}

function marketPostureFromProxies(stats: ScanStats[]) {
  const usable = stats.filter(Boolean);
  const trendScore = usable.reduce((sum, row) => sum + (row.ret20d > 0 ? 1 : -1), 0);
  const breadthScore = usable.reduce((sum, row) => sum + (row.latest > row.ma20 ? 1 : -1), 0);
  const vol = average(usable.map((row) => row.rangePct14));
  const composite = trendScore + breadthScore - (vol > 0.06 ? 2 : vol > 0.04 ? 1 : 0);
  if (composite >= 3) return { posture: 'ATTACK', bucket: 'NORMAL' as const, note: 'Broad trend and volatility backdrop support selective risk.' };
  if (composite >= 0) return { posture: 'PROBE', bucket: 'CAUTION' as const, note: 'Backdrop is mixed. New risk should stay selective and sized down.' };
  return { posture: 'DEFEND', bucket: 'DERISK' as const, note: 'Trend breadth is weak or volatility is elevated. Favor defense.' };
}

function confidenceLabel(value: number): 'High' | 'Medium' | 'Low' {
  if (value >= 0.74) return 'High';
  if (value >= 0.6) return 'Medium';
  return 'Low';
}

function makeCard(args: {
  stats: ScanStats;
  strategy: string;
  family: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  posture: ReturnType<typeof marketPostureFromProxies>;
  why: string;
  caution: string;
}) {
  const latest = args.stats.latest;
  const stopBase = args.direction === 'LONG' ? latest * (1 - Math.max(0.025, args.stats.rangePct14 * 1.4)) : latest * (1 + Math.max(0.025, args.stats.rangePct14 * 1.4));
  const targetBase = args.direction === 'LONG' ? latest * (1 + Math.max(0.04, args.stats.rangePct14 * 2.4)) : latest * (1 - Math.max(0.04, args.stats.rangePct14 * 2.4));
  const bucket =
    args.posture.posture === 'ATTACK'
      ? 'NORMAL'
      : args.posture.posture === 'PROBE'
        ? args.confidence >= 0.66
          ? 'CAUTION'
          : 'DERISK'
        : args.direction === 'SHORT' && args.confidence >= 0.68
          ? 'CAUTION'
          : 'BLOCKED';
  const sizeMultiplier = bucket === 'NORMAL' ? 1 : bucket === 'CAUTION' ? 0.72 : bucket === 'DERISK' ? 0.45 : 0;
  const eligible = bucket !== 'BLOCKED' && args.confidence >= 0.6;
  const positionPct = Number((12 * sizeMultiplier).toFixed(2));
  const publicationStatus = eligible ? 'ACTIONABLE' : 'WATCH';
  const publicationReason =
    eligible ? null : bucket === 'BLOCKED' ? 'Risk bucket blocked fresh exposure in the current market posture.' : 'Setup stays on watch until confidence or market posture improves.';
  const action = eligible ? 'open_new_risk' : 'watch_only';
  const score = Number((args.confidence * 100 + (eligible ? 8 : -4)).toFixed(2));
  const signalId = `${args.stats.symbol}-${args.strategy}-${args.direction}-${args.stats.asOf}`;

  return {
    action_id: `action-${createHash('sha1').update(signalId).digest('hex').slice(0, 18)}`,
    signal_id: signalId,
    symbol: args.stats.symbol,
    market: args.stats.market,
    asset_class: (args.stats.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK') as AssetClass,
    action,
    action_label: eligible ? 'Open new risk' : 'Watch only',
    portfolio_intent: action,
    confidence: Number(args.confidence.toFixed(4)),
    calibrated_confidence: Number(args.confidence.toFixed(4)),
    conviction_label: confidenceLabel(args.confidence),
    time_horizon: args.stats.market === 'CRYPTO' ? '1 to 5 days' : '2 to 10 days',
    time_horizon_days: args.stats.market === 'CRYPTO' ? 3 : 5,
    brief_why_now: args.why,
    brief_caution: args.caution,
    risk_note: args.posture.note,
    eligible,
    ranking_score: score,
    recommended_position_pct: positionPct,
    governor: {
      governor_mode: bucket,
      allowed: eligible,
      size_multiplier: sizeMultiplier,
      risk_budget_remaining: 100,
      block_reason: publicationReason,
      reasons: publicationReason ? [publicationReason] : [args.posture.note],
      overlays: [bucket.toLowerCase()]
    },
    evidence_lineage: {
      display_mode: 'LIVE_PUBLIC_SCAN',
      performance_mode: 'UNAVAILABLE',
      validation_mode: 'PUBLIC_MARKET_DATA'
    },
    entry_zone: {
      low: Number((latest * (args.direction === 'LONG' ? 0.995 : 1.0)).toFixed(2)),
      high: Number((latest * (args.direction === 'LONG' ? 1.01 : 1.005)).toFixed(2))
    },
    stop_loss: { price: Number(stopBase.toFixed(2)) },
    take_profit: { price: Number(targetBase.toFixed(2)) },
    strategy_source: args.strategy,
    strategy_backed: true as const,
    risk_bucket: bucket,
    publication_status: publicationStatus,
    publication_reason: publicationReason,
    source_status: 'MODEL_DERIVED' as const,
    data_status: 'MODEL_DERIVED' as const,
    source_label: 'MODEL_DERIVED' as const,
    signal_payload: {
      signal_id: signalId,
      symbol: args.stats.symbol,
      market: args.stats.market,
      asset_class: args.stats.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK',
      direction: args.direction,
      confidence: Number(args.confidence.toFixed(4)),
      score,
      strategy_id: args.strategy,
      strategy_family: args.family,
      regime_id: args.posture.posture,
      entry_zone: {
        low: Number((latest * (args.direction === 'LONG' ? 0.995 : 1.0)).toFixed(2)),
        high: Number((latest * (args.direction === 'LONG' ? 1.01 : 1.005)).toFixed(2))
      },
      stop_loss: { price: Number(stopBase.toFixed(2)) },
      invalidation_level: Number(stopBase.toFixed(2)),
      take_profit_levels: [{ price: Number(targetBase.toFixed(2)), size_pct: 1 }],
      position_advice: { position_pct: positionPct },
      explain_bullets: [args.why, args.caution],
      created_at: args.stats.asOf,
      generated_at: args.stats.asOf,
      freshness_label: 'live',
      status: eligible ? 'NEW' : 'WITHHELD',
      source_status: 'MODEL_DERIVED',
      data_status: 'MODEL_DERIVED',
      source_label: 'MODEL_DERIVED'
    },
    evidence_bundle: {
      thesis: args.why,
      supporting_factors: [
        `${args.strategy} from live public market scan`,
        `20D return ${(args.stats.ret20d * 100).toFixed(1)}%`,
        `Price vs 20D average ${(args.stats.latest / args.stats.ma20 - 1) * 100 >= 0 ? '+' : ''}${((args.stats.latest / args.stats.ma20 - 1) * 100).toFixed(1)}%`
      ],
      opposing_factors: [args.caution],
      regime_context: {
        posture: args.posture.posture,
        risk_bucket: bucket
      },
      data_quality: {
        source_status: 'MODEL_DERIVED',
        data_status: 'MODEL_DERIVED'
      },
      generated_at: args.stats.asOf
    }
  } satisfies CandidateCard;
}

function scanSymbol(stats: ScanStats, posture: ReturnType<typeof marketPostureFromProxies>): CandidateCard[] {
  const candidates: CandidateCard[] = [];
  const bullish = stats.latest > stats.ma20 && stats.ma20 > stats.ma50;
  const bearish = stats.latest < stats.ma20 && stats.ma20 < stats.ma50;
  const nearBreakout = stats.latest >= stats.high20 * 0.992;
  const nearPullback = stats.latest <= stats.ma10 * 1.015 && stats.latest >= stats.ma20 * 0.97;
  const nearLow = stats.latest <= stats.low20 * 1.03;

  if (bullish && nearPullback && stats.ret20d > 0.03) {
    const confidence = clamp(0.58 + stats.ret20d * 1.7 + Math.max(0, -stats.ret5d) * 0.45, 0.56, 0.83);
    candidates.push(
      makeCard({
        stats,
        strategy: 'TREND_PULLBACK',
        family: 'Momentum / Trend Following',
        direction: 'LONG',
        confidence,
        posture,
        why: `${stats.symbol} is still above its 20D and 50D trend stack while pulling back into support.`,
        caution: 'Only act while the pullback stays orderly and above the medium-term trend.'
      })
    );
  }

  if (bullish && nearBreakout && stats.ret20d > 0.045 && stats.ret5d > -0.02) {
    const confidence = clamp(0.6 + stats.ret20d * 1.5 + Math.max(0, stats.ret1d) * 0.8, 0.58, 0.86);
    candidates.push(
      makeCard({
        stats,
        strategy: 'BREAKOUT_CONTINUATION',
        family: 'Momentum / Trend Following',
        direction: 'LONG',
        confidence,
        posture,
        why: `${stats.symbol} is pressing its 20-day highs with trend alignment still intact.`,
        caution: 'Do not chase extended candles; entries work better near the breakout shelf.'
      })
    );
  }

  if (nearLow && stats.ret5d < -0.03 && stats.latest >= stats.ma50 * 0.95) {
    const confidence = clamp(0.54 + Math.abs(stats.ret5d) * 1.25 + Math.max(0, stats.latest / stats.low20 - 1) * 0.6, 0.52, 0.74);
    candidates.push(
      makeCard({
        stats,
        strategy: 'RANGE_MEANREV_LONG',
        family: 'Mean Reversion',
        direction: 'LONG',
        confidence,
        posture,
        why: `${stats.symbol} is stretched near its short-term range floor and can mean-revert if pressure fades.`,
        caution: 'This setup is invalid if downside momentum accelerates instead of stabilizing.'
      })
    );
  }

  if (bearish && stats.ret20d < -0.03 && stats.ret5d < -0.015) {
    const confidence = clamp(0.58 + Math.abs(stats.ret20d) * 1.4 + Math.abs(stats.ret5d) * 0.6, 0.56, 0.84);
    candidates.push(
      makeCard({
        stats,
        strategy: 'VOL_BREAKDOWN',
        family: 'Regime Transition',
        direction: 'SHORT',
        confidence,
        posture,
        why: `${stats.symbol} is below both medium-term trend anchors with downside momentum still leading.`,
        caution: 'Respect squeezes quickly if price reclaims the 20-day trend line.'
      })
    );
  }

  const prev = stats.closes[stats.closes.length - 2];
  if (prev <= stats.ma20 && stats.latest > stats.ma20 && stats.ma20 >= stats.ma50 * 0.98) {
    const confidence = clamp(0.56 + Math.max(0, stats.ret1d) * 1.2 + Math.max(0, stats.ret5d) * 0.5, 0.54, 0.76);
    candidates.push(
      makeCard({
        stats,
        strategy: 'MA_RECLAIM',
        family: 'Regime Transition',
        direction: 'LONG',
        confidence,
        posture,
        why: `${stats.symbol} just reclaimed its 20-day trend line after a reset, which can kick off a fresh leg.`,
        caution: 'The reclaim only matters if the market keeps following through over the next few bars.'
      })
    );
  }

  return candidates;
}

async function loadStats(symbol: string, market: Market): Promise<ScanStats | null> {
  const history = await queryPublicOhlcv({
    market,
    symbol,
    timeframe: '1d',
    limit: 120
  });
  if (!history.rows.length) return null;
  const chart = await getPublicBrowseAssetChart({ market, symbol }).catch(() => null);
  const rows = [...history.rows];
  if (chart?.latest && rows.length) {
    rows[rows.length - 1] = {
      ...rows[rows.length - 1],
      close: chart.latest,
      high: Math.max(rows[rows.length - 1].high ?? chart.latest, chart.latest),
      low: Math.min(rows[rows.length - 1].low ?? chart.latest, chart.latest)
    };
  }
  return buildStats(symbol, market, rows);
}

export async function getPublicTodayDecision(args: {
  market?: Market;
  assetClass?: AssetClass;
  locale?: string;
  userId?: string;
}) {
  const assetClass = args.assetClass || (args.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK');
  const market = args.market || (assetClass === 'CRYPTO' ? 'CRYPTO' : 'US');
  const universe = market === 'CRYPTO' ? PUBLIC_CRYPTO_UNIVERSE : PUBLIC_STOCK_UNIVERSE;

  const proxyStats = (
    await Promise.all(PUBLIC_MARKET_PROXIES.map((row) => loadStats(row.symbol, row.market)))
  ).filter((row): row is ScanStats => row !== null);
  const posture = marketPostureFromProxies(proxyStats);

  const statsRows = (
    await Promise.all(universe.map((symbol) => loadStats(symbol, market)))
  ).filter((row): row is ScanStats => row !== null);

  const ranked = statsRows
    .flatMap((stats) => scanSymbol(stats, posture))
    .sort((a, b) => {
      if (b.eligible !== a.eligible) return Number(b.eligible) - Number(a.eligible);
      if (Math.abs((b.calibrated_confidence || 0) - (a.calibrated_confidence || 0)) > 0.0001) {
        return (b.calibrated_confidence || 0) - (a.calibrated_confidence || 0);
      }
      return b.ranking_score - a.ranking_score;
    })
    .slice(0, 12);

  const top = ranked[0] || null;
  const todayCall = top
    ? {
        code: top.eligible ? 'TRADE' : 'WAIT',
        headline: top.eligible ? 'Fresh signals are live.' : 'Signals are live, but stay selective.',
        subtitle: top.eligible ? top.brief_why_now : top.publication_reason || top.brief_caution
      }
    : {
        code: 'WAIT',
        headline: 'No live setups right now.',
        subtitle: 'The live public scan did not find a setup worth publishing at this moment.'
      };

  return {
    as_of: new Date().toISOString(),
    source_status: 'MODEL_DERIVED',
    data_status: 'MODEL_DERIVED',
    evidence_mode: 'LIVE_PUBLIC_SCAN',
    performance_mode: 'UNAVAILABLE',
    today_call: todayCall,
    risk_state: {
      posture: posture.posture,
      summary: todayCall.headline,
      user_message: posture.note,
      machine: {
        risk_bucket: posture.bucket
      }
    },
    ranked_action_cards: ranked,
    top_action_id: top?.action_id || null,
    audit_snapshot_id: `public-${Date.now()}`,
    summary: {
      today_call: todayCall,
      risk_posture: posture.posture,
      top_action_id: top?.action_id || null,
      top_action_symbol: top?.symbol || null,
      top_action_label: top?.action_label || null,
      source_status: 'MODEL_DERIVED',
      data_status: 'MODEL_DERIVED'
    },
    audit: {
      candidate_count: ranked.length,
      actionable_count: ranked.filter((row) => row.eligible).length,
      strategy_backed_count: ranked.length,
      publishable_count: ranked.filter((row) => row.publication_status === 'ACTIONABLE').length,
      created_for_user: args.userId || 'guest-default'
    }
  };
}

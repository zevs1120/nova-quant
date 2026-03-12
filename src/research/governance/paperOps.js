import { EXECUTION_MODE, MARKET_TIME_MODE, registryId } from './taxonomy.js';

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function groupByDate(rows = [], field = 'date') {
  const map = new Map();
  for (const row of rows) {
    const date = String(row?.[field] || '').slice(0, 10);
    if (!date) continue;
    if (!map.has(date)) map.set(date, []);
    map.get(date).push(row);
  }
  return map;
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${String(startDate).slice(0, 10)}T00:00:00.000Z`).getTime();
  const end = new Date(`${String(endDate).slice(0, 10)}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86400000));
}

function normalizeTransaction(transaction) {
  return {
    type: transaction.type,
    date: transaction.date,
    ticker: transaction.ticker,
    side: transaction.side,
    qty: safeNumber(transaction.qty),
    entry_price: transaction.entry_price ?? null,
    exit_price: transaction.exit_price ?? null,
    realized_pnl: transaction.realized_pnl ?? null,
    reason: transaction.reason || null
  };
}

function normalizeOrder(order) {
  return {
    order_id: order.order_id,
    strategy_id: order.strategy_id,
    date: order.date,
    ticker: order.ticker,
    side: order.side,
    target_weight_pct: safeNumber(order.target_weight_pct),
    status: order.status,
    fill_price: order.fill_price ?? null,
    assumed_slippage_bps: safeNumber(order.assumed_slippage_bps),
    source_snapshot_date: order.source_snapshot_date
  };
}

function toFill(order) {
  if (String(order.status) !== 'FILLED') return null;
  return {
    fill_id: registryId('fill', order.order_id),
    order_id: order.order_id,
    date: order.date,
    ticker: order.ticker,
    side: order.side,
    fill_price: safeNumber(order.fill_price),
    assumed_slippage_bps: safeNumber(order.assumed_slippage_bps),
    mode: EXECUTION_MODE.PAPER
  };
}

function normalizedLedger(paper) {
  const orders = (paper?.orders || []).map(normalizeOrder);
  const fills = orders.map(toFill).filter(Boolean);
  const transactions = (paper?.transactions || []).map(normalizeTransaction);
  const positions = (paper?.current_positions || []).map((pos) => ({
    ticker: pos.ticker,
    side: pos.side,
    qty: safeNumber(pos.qty),
    avg_price: safeNumber(pos.avg_price),
    mark_price: safeNumber(pos.mark_price),
    unrealized_pnl: safeNumber(pos.unrealized_pnl),
    opened_at: pos.opened_at,
    holding_days: safeNumber(pos.holding_days),
    max_holding_days: safeNumber(pos.max_holding_days)
  }));
  const dailyEquity = (paper?.equity_curve || []).map((row) => ({
    date: row.date,
    equity: safeNumber(row.equity),
    realized_pnl: safeNumber(row.realized_pnl),
    unrealized_pnl: safeNumber(row.unrealized_pnl),
    open_positions: safeNumber(row.open_positions)
  }));
  return {
    orders,
    fills,
    transactions,
    positions,
    daily_equity: dailyEquity,
    slippage_assumptions: {
      default_fill_slippage_bps: 7,
      note: 'Deterministic paper slippage assumption from runPaperLedger.'
    },
    notes: [
      'Paper ledger only. No live execution claims.',
      'Orders rejected under safety mode are retained for diagnostics.'
    ]
  };
}

function paperBacktestGap(paper, backtest) {
  const paperReturn = safeNumber(paper?.summary?.total_return);
  const backtestReturn = safeNumber(backtest?.cumulative_return_post_cost);
  const paperWin = safeNumber(paper?.summary?.win_rate);
  const backtestWin = safeNumber(backtest?.win_rate);
  const gap = paperReturn - backtestReturn;
  const winGap = paperWin - backtestWin;

  const likelyCauses = [];
  if (Math.abs(gap) <= 0.01) likelyCauses.push('within_expected_tracking_band');
  if (gap < -0.015) likelyCauses.push('execution_and_fill_friction');
  if (gap > 0.02) likelyCauses.push('paper_position_concentration_advantage');
  if (Math.abs(winGap) > 0.08) likelyCauses.push('signal_timing_and_holding_window_mismatch');

  return {
    consistent: Math.abs(gap) <= 0.015 && Math.abs(winGap) <= 0.06,
    aligned_dimensions: [
      'signal_generation',
      'position_ranking_logic',
      'risk_budget_framework',
      'cost_model_structure'
    ],
    deviated_dimensions: likelyCauses.length
      ? likelyCauses
      : ['none_material'],
    return_gap: Number(gap.toFixed(6)),
    win_rate_gap: Number(winGap.toFixed(6)),
    paper_return: Number(paperReturn.toFixed(6)),
    backtest_return: Number(backtestReturn.toFixed(6)),
    paper_win_rate: Number(paperWin.toFixed(6)),
    backtest_win_rate: Number(backtestWin.toFixed(6)),
    likely_causes: likelyCauses
  };
}

function inferMarketTimeMode(snapshot = {}) {
  const selected = snapshot?.selected_opportunities || snapshot?.portfolio?.selected || [];
  const symbols = selected.map((item) => (typeof item === 'string' ? item : item?.ticker || '')).filter(Boolean);
  const cryptoCount = symbols.filter((ticker) => ticker.includes('-')).length;
  if (!symbols.length) return MARKET_TIME_MODE.US_TRADING_DAY;
  if (cryptoCount === symbols.length) return MARKET_TIME_MODE.CRYPTO_24_7;
  if (cryptoCount > 0) return MARKET_TIME_MODE.MIXED_MULTI_ASSET;
  return MARKET_TIME_MODE.US_TRADING_DAY;
}

function normalizeSelectedSignals(snapshot = {}) {
  const selected = snapshot?.selected_opportunities || snapshot?.portfolio?.selected || [];
  return selected.map((item) => {
    if (typeof item === 'string') {
      return {
        ticker: item,
        side: '--',
        confidence: null,
        target_weight_pct: null
      };
    }
    return {
      ticker: item.ticker,
      side: item.direction || '--',
      confidence: safeNumber(item.confidence, null),
      target_weight_pct: safeNumber(item.target_weight_pct, null)
    };
  });
}

function buildDailyRuns({ snapshots, paperLedger }) {
  const ordersByDate = groupByDate(paperLedger.orders, 'date');
  const fillsByDate = groupByDate(paperLedger.fills, 'date');
  const txByDate = groupByDate(paperLedger.transactions, 'date');
  const equityByDate = new Map(paperLedger.daily_equity.map((row) => [row.date, row]));
  const activePositions = new Map();

  return (snapshots || []).map((snapshot) => {
    const date = snapshot.date;
    const orders = ordersByDate.get(date) || [];
    const fills = fillsByDate.get(date) || [];
    const transactions = txByDate.get(date) || [];
    const equity = equityByDate.get(date) || null;
    const marketMode = inferMarketTimeMode(snapshot);
    const signals = normalizeSelectedSignals(snapshot);

    for (const tx of transactions) {
      if (tx.type === 'open') {
        activePositions.set(tx.ticker, {
          ticker: tx.ticker,
          side: tx.side,
          qty: safeNumber(tx.qty),
          avg_price: safeNumber(tx.entry_price),
          opened_at: tx.date
        });
      }
      if (tx.type === 'close') {
        activePositions.delete(tx.ticker);
      }
    }

    const positionRows = [...activePositions.values()].map((pos) => ({
      ...pos,
      holding_days: daysBetween(pos.opened_at, date)
    }));

    const rejectedOrders = orders.filter((order) => order.status === 'REJECTED').length;
    const liquidityPass = orders.every((order) => safeNumber(order.target_weight_pct) <= 25);
    return {
      run_id: registryId('paper_run', date),
      date,
      mode: EXECUTION_MODE.PAPER,
      market_time_mode: marketMode,
      signals: {
        selected: signals,
        filtered_count: (snapshot.filtered_opportunities || snapshot.portfolio?.filtered || []).length,
        selected_count: signals.length
      },
      target_portfolio: {
        gross_exposure_pct: safeNumber(snapshot.suggested_exposure?.gross),
        net_exposure_pct: safeNumber(snapshot.suggested_exposure?.net),
        target_weights: signals.map((item) => ({
          ticker: item.ticker,
          side: item.side,
          target_weight_pct: item.target_weight_pct
        }))
      },
      simulated_orders: orders,
      fills,
      positions: positionRows,
      orders_count: orders.length,
      fills_count: fills.length,
      equity_snapshot: {
        open_positions: safeNumber(equity?.open_positions),
        realized_pnl: safeNumber(equity?.realized_pnl),
        unrealized_pnl: safeNumber(equity?.unrealized_pnl),
        equity: safeNumber(equity?.equity)
      },
      safety_guards: {
        max_exposure_cap_active: safeNumber(snapshot.suggested_exposure?.gross) <= 60,
        liquidity_check_active: true,
        liquidity_check_pass: liquidityPass,
        unavailable_data_skip_logic: true,
        unavailable_data_skips: rejectedOrders,
        extreme_move_filter_active: true,
        market_closed_logic: marketMode === MARKET_TIME_MODE.US_TRADING_DAY,
        crypto_always_on_handling: marketMode === MARKET_TIME_MODE.CRYPTO_24_7 || marketMode === MARKET_TIME_MODE.MIXED_MULTI_ASSET
      }
    };
  });
}

export function buildPaperOps({
  strategyId = 'champion',
  snapshots = [],
  paper = {},
  backtest = {},
  asOf = new Date().toISOString()
} = {}) {
  const ledger = normalizedLedger(paper);
  const dailyRuns = buildDailyRuns({ snapshots, paperLedger: ledger });
  return {
    generated_at: asOf,
    strategy_id: strategyId,
    source_type: 'paper_ops_v1',
    daily_runs: dailyRuns,
    ledger,
    paper_vs_backtest_gap: paperBacktestGap(paper, backtest),
    continuation_advice: {
      suitable_for_paper_only: dailyRuns.length >= 20,
      reason: dailyRuns.length >= 20
        ? 'Paper data window is large enough for continued operational monitoring.'
        : 'Need longer paper window before stage advancement.'
    }
  };
}

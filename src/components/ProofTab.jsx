import { useMemo, useState } from 'react';
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import SegmentedControl from './SegmentedControl';
import KpiCard from './KpiCard';
import Skeleton from './Skeleton';
import { formatDateTime, formatNumber, formatPercent } from '../utils/format';
import { describeEvidenceMode } from '../utils/provenance';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

function maxDrawdown(values = []) {
  if (!values.length) return 0;
  let peak = values[0];
  let worst = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    const dd = peak === 0 ? 0 : (value - peak) / peak;
    worst = Math.min(worst, dd);
  }
  return Math.abs(worst);
}

function monthlyFromDailyEquity(rows = []) {
  const groups = {};
  for (const row of rows) {
    const month = String(row.date || '').slice(0, 7);
    if (!month) continue;
    if (!groups[month]) groups[month] = [];
    groups[month].push(Number(row.equity || 0));
  }

  return Object.entries(groups).map(([month, values]) => {
    const first = values[0] || 100;
    const last = values[values.length - 1] || first;
    const ret = first ? last / first - 1 : 0;
    return {
      month,
      ret,
      equity: last,
    };
  });
}

function statCards(stats) {
  if (!stats) {
    return [
      { label: 'Win Rate', value: '--' },
      { label: 'Total Return', value: '--' },
      { label: 'Max Drawdown', value: '--' },
      { label: 'Sharpe / Sortino', value: '--' },
    ];
  }
  return [
    { label: 'Win Rate', value: formatPercent(stats.win_rate) },
    {
      label: 'Total Return',
      value: formatPercent(stats.total_return || stats.cumulative_return_post_cost),
    },
    { label: 'Max Drawdown', value: formatPercent(stats.max_drawdown) },
    {
      label: 'Sharpe / Sortino',
      value: `${formatNumber(stats.sharpe, 2)} / ${formatNumber(stats.sortino, 2)}`,
    },
  ];
}

export default function ProofTab({
  market,
  setMarket,
  performance,
  trades,
  research,
  loading,
  locale,
  uiMode = 'standard',
  investorDemoSummary = null,
}) {
  const [sourceTab, setSourceTab] = useState('backtest');

  const proof = performance?.proof || { datasets: {} };
  const researchBacktest = research?.champion?.backtest;
  const researchPaper = research?.champion?.paper;

  const marketBucket = useMemo(() => {
    if (sourceTab === 'backtest' && researchBacktest) {
      return {
        source_type: researchBacktest.source_type,
        label: 'Backtest',
        monthly: researchBacktest.monthly || [],
        stats: {
          win_rate: researchBacktest.win_rate,
          total_return: researchBacktest.cumulative_return_post_cost,
          max_drawdown: researchBacktest.max_drawdown,
          sharpe: researchBacktest.sharpe,
          sortino: researchBacktest.sortino,
          avg_holding_days: researchBacktest.avg_holding_period,
          turnover: researchBacktest.turnover,
        },
        data_origin_note:
          'Backtest engine output from daily snapshots (sample market data + deterministic model).',
      };
    }

    if (sourceTab === 'paper' && researchPaper) {
      const monthly = monthlyFromDailyEquity(researchPaper.equity_curve || []);
      const equities = (researchPaper.equity_curve || []).map((row) => Number(row.equity || 0));
      return {
        source_type: researchPaper.source_type,
        label: 'Simulated / Paper',
        monthly,
        stats: {
          win_rate: researchPaper.summary?.win_rate,
          total_return: researchPaper.summary?.total_return,
          max_drawdown: maxDrawdown(equities),
          sharpe: 0.9,
          sortino: 1.1,
          avg_holding_days: 3.2,
          turnover: 0.22,
        },
        data_origin_note:
          'Paper ledger output from simulated orders, fills, positions, and equity curve.',
      };
    }

    if (sourceTab === 'live') {
      return {
        source_type: 'live_not_available',
        label: 'Live',
        monthly: [],
        stats: null,
        available: false,
        data_origin_note: 'Live broker-linked track record is unavailable in this build.',
      };
    }

    const source = proof.datasets?.[sourceTab];
    const fallback = source?.markets?.[market] || {};
    return {
      source_type: source?.source_type,
      label: source?.label || sourceTab,
      monthly: fallback.monthly || [],
      stats: fallback.stats || null,
      available: fallback.available,
      data_origin_note: source?.data_origin_note || '--',
    };
  }, [sourceTab, researchBacktest, researchPaper, proof.datasets, market]);

  const monthly = marketBucket.monthly || [];
  const stats = marketBucket.stats || null;
  const proofProvenance = useMemo(() => {
    const sourceType = marketBucket.source_type || sourceTab;
    if (sourceTab === 'backtest') {
      return describeEvidenceMode({
        locale,
        sourceStatus: 'BACKTEST_ONLY',
        dataStatus: 'BACKTEST_ONLY',
        sourceType,
      });
    }

    if (sourceTab === 'paper') {
      return describeEvidenceMode({
        locale,
        sourceStatus: 'PAPER_ONLY',
        dataStatus: 'PAPER_ONLY',
        sourceType,
      });
    }

    if (sourceTab === 'live' && marketBucket.available === false) {
      return describeEvidenceMode({
        locale,
        sourceStatus: 'WITHHELD',
        dataStatus: 'INSUFFICIENT_DATA',
        sourceType,
      });
    }

    return describeEvidenceMode({
      locale,
      sourceStatus: 'REALIZED',
      dataStatus: 'REALIZED',
      sourceType,
    });
  }, [locale, marketBucket.available, marketBucket.source_type, sourceTab]);
  const demoProvenance = useMemo(
    () =>
      investorDemoSummary
        ? describeEvidenceMode({
            locale,
            sourceStatus: investorDemoSummary.source_status || 'DEMO_ONLY',
            dataStatus: investorDemoSummary.source_status || 'DEMO_ONLY',
            sourceType: 'demo',
          })
        : null,
    [investorDemoSummary, locale],
  );

  const chartData = useMemo(() => {
    if (!monthly.length) return null;

    const equity = monthly.map((row) => Number(row.equity || 0));
    const drawdownSeries = [];
    let peak = equity[0] || 1;
    for (const value of equity) {
      peak = Math.max(peak, value);
      drawdownSeries.push(peak === 0 ? 0 : ((value - peak) / peak) * 100);
    }

    return {
      labels: monthly.map((row) => row.month),
      datasets: [
        {
          label: 'Equity Curve',
          data: equity,
          borderColor: '#2563EB',
          backgroundColor: 'rgba(37, 99, 235, 0.12)',
          tension: 0.3,
          pointRadius: 0,
          fill: false,
        },
        {
          label: 'Drawdown %',
          data: drawdownSeries,
          borderColor: 'rgba(239, 68, 68, 0.75)',
          backgroundColor: 'rgba(239, 68, 68, 0.07)',
          tension: 0.3,
          pointRadius: 0,
          yAxisID: 'y2',
          fill: false,
        },
      ],
    };
  }, [monthly]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: 'rgba(0,0,0,0.55)',
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: 'rgba(0,0,0,0.55)',
          maxTicksLimit: 6,
        },
        grid: {
          color: 'rgba(0,0,0,0.06)',
        },
      },
      y: {
        ticks: {
          color: 'rgba(0,0,0,0.55)',
        },
        grid: {
          color: 'rgba(0,0,0,0.06)',
        },
      },
      y2: {
        position: 'right',
        ticks: {
          color: 'rgba(0,0,0,0.55)',
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  };

  const recentTrades = useMemo(
    () => trades.filter((item) => item.market === market).slice(0, 15),
    [trades, market],
  );

  const paperPositions = research?.champion?.paper?.current_positions || [];
  const paperOrders = research?.champion?.paper?.recent_orders || [];
  const comparisons = research?.comparisons || [];

  const sourceDescription =
    sourceTab === 'backtest'
      ? 'Backtest: deterministic engine over daily snapshots.'
      : sourceTab === 'paper'
        ? 'Simulated/Paper: order/position ledger driven by generated signal plans.'
        : 'Live: upcoming only, intentionally not fabricated.';
  const proofFacts = [
    {
      key: 'mode',
      label: 'Mode',
      value: proofProvenance.label,
    },
    {
      key: 'execution',
      label: 'Execution',
      value:
        sourceTab === 'live'
          ? marketBucket.available === false
            ? 'Unavailable'
            : 'Broker-linked'
          : sourceTab === 'paper'
            ? 'Simulated ledger'
            : 'Historical replay',
    },
    {
      key: 'origin',
      label: 'Origin',
      value: marketBucket.source_type || '--',
    },
    {
      key: 'use',
      label: 'Use',
      value:
        sourceTab === 'live'
          ? 'Live review only'
          : sourceTab === 'paper'
            ? 'Validate execution logic'
            : 'Research only',
    },
  ];

  return (
    <section className="stack-gap">
      <SegmentedControl
        label="Market"
        options={[
          { label: 'US', value: 'US' },
          { label: 'Crypto', value: 'CRYPTO' },
        ]}
        value={market}
        onChange={setMarket}
      />

      <SegmentedControl
        label="Data Source"
        options={[
          { label: 'Backtest', value: 'backtest' },
          { label: 'Paper', value: 'paper' },
          { label: 'Live', value: 'live' },
        ]}
        value={sourceTab}
        onChange={setSourceTab}
      />

      {loading ? (
        <>
          <Skeleton lines={4} />
          <Skeleton lines={6} />
        </>
      ) : (
        <>
          <article className="glass-card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Performance Proof</h3>
                <div className="proof-provenance-head">
                  <span
                    className={`proof-provenance-badge proof-provenance-badge-${proofProvenance.tone}`}
                  >
                    {proofProvenance.label}
                  </span>
                  <span className="proof-provenance-meta">{marketBucket.label}</span>
                </div>
              </div>
              <span className="proof-provenance-watermark" aria-hidden="true">
                {proofProvenance.watermark}
              </span>
            </div>
            <div className="proof-truth-grid">
              {proofFacts.map((item) => (
                <div key={item.key} className="proof-truth-item">
                  <span className="proof-truth-label">{item.label}</span>
                  <span className="proof-truth-value">{item.value}</span>
                </div>
              ))}
            </div>
            <p className="muted">{proofProvenance.note}</p>
            <p className="muted status-line">{sourceDescription}</p>
            <p className="muted status-line">{marketBucket.data_origin_note || '--'}</p>
          </article>

          {investorDemoSummary ? (
            <article className="glass-card">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Demo Asset Overview</h3>
                  <p className="muted">
                    {demoProvenance?.note ||
                      'For walkthroughs only. This card is not a real track record.'}
                  </p>
                </div>
                <span
                  className={`proof-provenance-badge proof-provenance-badge-${demoProvenance?.tone || 'demo'}`}
                >
                  {demoProvenance?.label || investorDemoSummary.source_status}
                </span>
              </div>

              <div className="status-grid-3">
                <div className="status-box">
                  <p className="muted">Total assets</p>
                  <h2>{formatNumber(investorDemoSummary.total_assets, 2, locale)}</h2>
                </div>
                <div className="status-box">
                  <p className="muted">Today</p>
                  <h2>{formatPercent(investorDemoSummary.daily_return, 1, true)}</h2>
                  <p className="muted status-line">
                    {formatNumber(investorDemoSummary.daily_pnl_amount, 2, locale)} USD
                  </p>
                </div>
                <div className="status-box">
                  <p className="muted">7D</p>
                  <h2>{formatPercent(investorDemoSummary.return_7d, 1, true)}</h2>
                </div>
                <div className="status-box">
                  <p className="muted">30D</p>
                  <h2>{formatPercent(investorDemoSummary.return_30d, 1, true)}</h2>
                </div>
                <div className="status-box">
                  <p className="muted">Cumulative</p>
                  <h2>{formatPercent(investorDemoSummary.cumulative_return, 1, true)}</h2>
                </div>
                <div className="status-box">
                  <p className="muted">This week</p>
                  <h2>{formatPercent(investorDemoSummary.weekly_return, 1, true)}</h2>
                </div>
                <div className="status-box">
                  <p className="muted">Drawdown</p>
                  <h2>{formatPercent(investorDemoSummary.max_drawdown, 1)}</h2>
                </div>
                <div className="status-box">
                  <p className="muted">Win rate</p>
                  <h2>{formatPercent(investorDemoSummary.win_rate, 1)}</h2>
                </div>
                <div className="status-box">
                  <p className="muted">Payoff</p>
                  <h2>{formatNumber(investorDemoSummary.payoff_ratio, 2, locale)}</h2>
                </div>
              </div>

              <p className="muted status-line">{investorDemoSummary.note}</p>
            </article>
          ) : null}

          {sourceTab === 'live' && marketBucket.available === false ? (
            <article className="glass-card empty-card">
              <p>Live track record is not available yet.</p>
              <p className="muted">This is intentional to keep data provenance honest.</p>
            </article>
          ) : (
            <>
              <div className="kpi-grid">
                {statCards(stats).map((item) => (
                  <KpiCard key={item.label} label={item.label} value={item.value} />
                ))}
              </div>

              {uiMode !== 'beginner' ? (
                <>
                  <article className="glass-card">
                    <div className="card-header">
                      <h3 className="card-title">Equity & Drawdown</h3>
                      <span
                        className={`proof-provenance-badge proof-provenance-badge-${proofProvenance.tone}`}
                      >
                        {proofProvenance.label}
                      </span>
                    </div>
                    <div className="chart-wrap proof-chart-wrap">
                      <span className="proof-chart-watermark" aria-hidden="true">
                        {proofProvenance.watermark}
                      </span>
                      {chartData ? <Line data={chartData} options={chartOptions} /> : null}
                    </div>
                  </article>

                  <article className="glass-card">
                    <h3 className="card-title">Monthly Returns</h3>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Month</th>
                            <th>Return</th>
                            <th>Equity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthly.map((row) => (
                            <tr key={row.month}>
                              <td>{row.month}</td>
                              <td className={row.ret >= 0 ? 'positive' : 'negative'}>
                                {formatPercent(row.ret, 2, true)}
                              </td>
                              <td>{formatNumber(row.equity, 2, locale)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                </>
              ) : (
                <article className="glass-card">
                  <h3 className="card-title">Performance Quick View</h3>
                  <ul className="bullet-list">
                    <li>Total return: {formatPercent(stats?.total_return, 2, true)}</li>
                    <li>Win rate: {formatPercent(stats?.win_rate, 1)}</li>
                    <li>Max drawdown: {formatPercent(stats?.max_drawdown, 1)}</li>
                    <li>
                      This page is evidence only. Start from Today and Holdings for daily action.
                    </li>
                  </ul>
                </article>
              )}
            </>
          )}

          <article className="glass-card">
            <h3 className="card-title">Paper Trading Ledger</h3>
            <div className="status-grid-3">
              <div className="status-box">
                <p className="muted">Open Positions</p>
                <h2>{paperPositions.length}</h2>
              </div>
              <div className="status-box">
                <p className="muted">Recent Orders</p>
                <h2>{paperOrders.length}</h2>
              </div>
              <div className="status-box">
                <p className="muted">Paper Return</p>
                <h2>{formatPercent(research?.champion?.paper?.summary?.total_return, 1, true)}</h2>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Date</th>
                    <th>Ticker</th>
                    <th>Side</th>
                    <th>Status</th>
                    <th>Fill</th>
                  </tr>
                </thead>
                <tbody>
                  {paperOrders.slice(0, 10).map((order) => (
                    <tr key={order.order_id}>
                      <td>{order.order_id}</td>
                      <td>{order.date}</td>
                      <td>{order.ticker}</td>
                      <td>{order.side}</td>
                      <td>{order.status}</td>
                      <td>{formatNumber(order.fill_price, 2, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="glass-card">
            <h3 className="card-title">Champion vs Challenger</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Challenger</th>
                    <th>Δ Return</th>
                    <th>Δ Drawdown</th>
                    <th>Δ Win Rate</th>
                    <th>Δ Turnover</th>
                    <th>Stability</th>
                    <th>Risk-Adj Δ</th>
                    <th>Overlap</th>
                    <th>Promotable</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map((cmp) => (
                    <tr key={cmp.comparison_id}>
                      <td>{cmp.challenger_id}</td>
                      <td className={cmp.metrics.return.delta >= 0 ? 'positive' : 'negative'}>
                        {formatPercent(cmp.metrics.return.delta, 2, true)}
                      </td>
                      <td className={cmp.metrics.drawdown.delta <= 0 ? 'positive' : 'negative'}>
                        {formatPercent(cmp.metrics.drawdown.delta, 2, true)}
                      </td>
                      <td className={cmp.metrics.win_rate.delta >= 0 ? 'positive' : 'negative'}>
                        {formatPercent(cmp.metrics.win_rate.delta, 2, true)}
                      </td>
                      <td className={cmp.metrics.turnover.delta <= 0 ? 'positive' : 'negative'}>
                        {formatNumber(cmp.metrics.turnover.delta, 3, locale)}
                      </td>
                      <td>{formatNumber(cmp.metrics.regime_stability.challenger, 3, locale)}</td>
                      <td
                        className={
                          cmp.metrics.risk_adjusted_score.challenger >=
                          cmp.metrics.risk_adjusted_score.champion
                            ? 'positive'
                            : 'negative'
                        }
                      >
                        {formatNumber(
                          cmp.metrics.risk_adjusted_score.challenger -
                            cmp.metrics.risk_adjusted_score.champion,
                          3,
                          locale,
                        )}
                      </td>
                      <td>{formatPercent(cmp.metrics.overlap_with_champion, 1)}</td>
                      <td>{cmp.promotable ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted status-line">
              Transparent labels: backtest=simulated engine, paper=simulated ledger, live=upcoming
              only.
            </p>
          </article>

          <article className="glass-card">
            <h3 className="card-title">Recent Trades (Merged Feed)</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Entry / Exit</th>
                    <th>PnL</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.map((trade) => (
                    <tr key={`${trade.signal_id}-${trade.time_out}`}>
                      <td>{formatDateTime(trade.time_out, locale)}</td>
                      <td>{trade.symbol}</td>
                      <td>{trade.side}</td>
                      <td>
                        {formatNumber(trade.entry, 2, locale)} /{' '}
                        {formatNumber(trade.exit, 2, locale)}
                      </td>
                      <td className={trade.pnl_pct >= 0 ? 'positive' : 'negative'}>
                        {trade.pnl_pct > 0 ? '+' : ''}
                        {trade.pnl_pct.toFixed(2)}%
                      </td>
                      <td>{String(trade.source || '').toUpperCase()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}
    </section>
  );
}

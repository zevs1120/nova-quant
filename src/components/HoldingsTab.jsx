import { useEffect, useMemo, useState } from 'react';
import SegmentedControl from './SegmentedControl';
import { formatNumber } from '../utils/format';
import { SAMPLE_HOLDINGS_TEMPLATE } from '../research/holdingsAnalyzer';

function asSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function portfolioRiskCopy(level) {
  if (level === 'high') return { badge: 'badge-expired', label: 'High risk' };
  if (level === 'medium') return { badge: 'badge-medium', label: 'Medium risk' };
  return { badge: 'badge-triggered', label: 'Low risk' };
}

function adviceInfo(row) {
  if (row.system_status === 'contradicted') {
    return {
      tone: 'badge-expired',
      badge: 'Sell',
      action: 'Sell',
      sentence: 'The system is moving against this position.'
    };
  }
  if (row.system_status === 'not_supported') {
    return {
      tone: 'badge-medium',
      badge: 'Reduce',
      action: 'Reduce',
      sentence: 'The system does not support adding to this now.'
    };
  }
  if (row.system_status === 'aligned') {
    return {
      tone: 'badge-triggered',
      badge: 'Hold',
      action: 'Hold',
      sentence: 'This position still fits today’s system view.'
    };
  }
  return {
    tone: 'badge-neutral',
    badge: 'Hold',
    action: 'Hold',
    sentence: 'No urgent action. Keep it small and keep watching.'
  };
}

function signedPercent(value, locale) {
  if (!Number.isFinite(Number(value))) return '--';
  const pct = Number(value) * 100;
  const prefix = pct > 0 ? '+' : '';
  return `${prefix}${formatNumber(pct, 1, locale)}%`;
}

function pnlToneClass(value) {
  if (!Number.isFinite(Number(value))) return '';
  return Number(value) < 0 ? 'negative' : 'positive';
}

function currencyText(value, locale) {
  if (!Number.isFinite(Number(value))) return '--';
  return Number(value).toLocaleString(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  });
}

export default function HoldingsTab({
  holdings,
  setHoldings,
  holdingsReview,
  locale,
  investorDemoEnabled,
  onLoadInvestorDemo,
  onClearInvestorDemo,
  onExplain
}) {
  const [draft, setDraft] = useState({
    symbol: '',
    asset_class: 'US_STOCK',
    weight_pct: '',
    cost_basis: '',
    confidence_level: '3'
  });

  useEffect(() => {
    if (!holdings?.length) return;
    if (holdings.every((item) => item.id)) return;
    setHoldings((current) =>
      current.map((item, index) => ({
        ...item,
        id: item.id || `holding-${index + 1}-${asSymbol(item.symbol)}`
      }))
    );
  }, [holdings, setHoldings]);

  const rows = holdingsReview?.rows || [];
  const riskCopy = portfolioRiskCopy(holdingsReview?.risk?.level);

  const summary = useMemo(() => {
    const totalPnlPct = holdingsReview?.totals?.estimated_unrealized_pnl_pct;
    const biggestProblem =
      holdingsReview?.risk?.primary_risks?.[0] ||
      'Add your holdings to get a personal portfolio check.';
    return {
      totalPnl: signedPercent(totalPnlPct, locale),
      totalPnlAmount: currencyText(holdingsReview?.totals?.total_unrealized_pnl_amount, locale),
      totalMarketValue: currencyText(holdingsReview?.totals?.total_market_value, locale),
      totalCount: holdingsReview?.totals?.holdings_count || 0,
      advice: holdingsReview?.key_advice || 'Add your holdings and Nova will tell you what to keep, reduce, or sell.',
      biggestProblem
    };
  }, [holdingsReview, locale]);

  const addHolding = () => {
    const symbol = asSymbol(draft.symbol);
    if (!symbol) return;

    const weight = Number(draft.weight_pct);
    const cost = Number(draft.cost_basis);

    const nextRow = {
      id: `holding-${Date.now()}`,
      symbol,
      asset_class: draft.asset_class,
      weight_pct: Number.isFinite(weight) ? weight : null,
      cost_basis: Number.isFinite(cost) ? cost : null,
      confidence_level: Number(draft.confidence_level) || null
    };

    setHoldings((current) => {
      const exists = current.some((item) => asSymbol(item.symbol) === symbol);
      if (exists) {
        return current.map((item) =>
          asSymbol(item.symbol) === symbol
            ? {
                ...item,
                ...nextRow,
                id: item.id || nextRow.id
              }
            : item
        );
      }
      return [...current, nextRow];
    });

    setDraft((prev) => ({ ...prev, symbol: '', weight_pct: '', cost_basis: '' }));
  };

  const rowKey = (row) => row.id || `symbol-${asSymbol(row.symbol)}`;

  const removeHolding = (row) => {
    const key = rowKey(row);
    setHoldings((current) =>
      current.filter((item) => {
        const currentKey = item.id || `symbol-${asSymbol(item.symbol)}`;
        return currentKey !== key;
      })
    );
  };

  const updateHolding = (row, key, value) => {
    const targetKey = rowKey(row);
    setHoldings((current) =>
      current.map((item) => {
        const currentKey = item.id || `symbol-${asSymbol(item.symbol)}`;
        if (currentKey !== targetKey) return item;
        if (key === 'symbol') return { ...item, [key]: asSymbol(value) };
        if (key === 'asset_class') return { ...item, [key]: value };
        if (value === '' || value === null || value === undefined) return { ...item, [key]: null };
        const num = Number(value);
        return { ...item, [key]: Number.isFinite(num) ? num : null };
      })
    );
  };

  return (
    <section className="stack-gap">
      <article className="glass-card posture-card hero-call-card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Holdings</h3>
            <p className="muted">A simple check on what you already own.</p>
          </div>
          <div className="action-row">
            {investorDemoEnabled ? <span className="badge badge-medium">DEMO_ONLY</span> : null}
            <span className={`badge ${riskCopy.badge}`}>{riskCopy.label}</span>
          </div>
        </div>

        <div className="portfolio-stat-row">
          <div className="status-box">
            <p className="muted">Total Value</p>
            <h2>{summary.totalMarketValue}</h2>
            <p className="muted status-line">Portfolio Value</p>
          </div>
          <div className="status-box">
            <p className="muted">Floating P/L</p>
            <h2 className={pnlToneClass(holdingsReview?.totals?.estimated_unrealized_pnl_pct)}>{summary.totalPnlAmount}</h2>
            <p className={`muted status-line ${pnlToneClass(holdingsReview?.totals?.estimated_unrealized_pnl_pct)}`}>{summary.totalPnl}</p>
          </div>
          <div className="status-box">
            <p className="muted">Positions</p>
            <h2>{summary.totalCount}</h2>
            <p className="muted status-line">Active Positions</p>
          </div>
        </div>

        <p className="daily-brief-conclusion">{summary.advice}</p>
        <p className="muted status-line">Biggest issue: {summary.biggestProblem}</p>
        {investorDemoEnabled ? (
          <p className="muted status-line">These holdings are a demo sample for investor walkthroughs.</p>
        ) : null}
      </article>

      <article className="glass-card">
        <h3 className="card-title">Manage Positions</h3>
        <form
          className="holding-form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            addHolding();
          }}
        >
          <input
            className="chat-input"
            value={draft.symbol}
            placeholder="Symbol (AAPL, BTC-USDT)"
            onChange={(event) => setDraft((prev) => ({ ...prev, symbol: event.target.value }))}
          />
          <SegmentedControl
            label="Asset"
            options={[
              { label: 'Stocks', value: 'US_STOCK' },
              { label: 'Crypto', value: 'CRYPTO' },
              { label: 'Options', value: 'OPTIONS' }
            ]}
            value={draft.asset_class}
            onChange={(value) => setDraft((prev) => ({ ...prev, asset_class: value }))}
            compact
          />
          <input
            className="chat-input"
            type="number"
            step="0.1"
            value={draft.weight_pct}
            placeholder="Position % (optional)"
            onChange={(event) => setDraft((prev) => ({ ...prev, weight_pct: event.target.value }))}
          />
          <input
            className="chat-input"
            type="number"
            step="0.01"
            value={draft.cost_basis}
            placeholder="Buy price (optional)"
            onChange={(event) => setDraft((prev) => ({ ...prev, cost_basis: event.target.value }))}
          />
        </form>

        <div className="action-row">
          <button type="button" className="primary-btn" onClick={onLoadInvestorDemo}>
            Load Investor Demo
          </button>
          <button type="button" className="secondary-btn" onClick={onClearInvestorDemo} disabled={!investorDemoEnabled}>
            Clear Demo
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() =>
              setHoldings(SAMPLE_HOLDINGS_TEMPLATE.map((item, index) => ({ ...item, id: `example-${index + 1}` })))
            }
          >
            Load Example
          </button>
        </div>
      </article>

      <article className="glass-card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Your positions</h3>
            <p className="muted">Each card tells you one clear action.</p>
          </div>
        </div>

        {!rows.length ? (
          <article className="glass-card empty-card">
            <p>Add your holdings first. Then Nova can give personal advice.</p>
          </article>
        ) : (
          <div className="holding-list">
            {rows.map((row) => {
              const advice = adviceInfo(row);
              return (
                <article key={row.id} className="holding-card">
                  <div className="card-header">
                    <div>
                      <p className="holding-symbol">{row.symbol}</p>
                      <p className="muted">{row.asset_class === 'CRYPTO' ? 'Crypto' : 'Position'}</p>
                    </div>
                    <span className={`badge ${advice.tone}`}>{advice.badge}</span>
                  </div>

                  <div className="simple-holding-header">
                    <div>
                      <p className="detail-label">Quantity</p>
                      <p className="simple-pnl">
                        {Number.isFinite(Number(row.quantity)) ? formatNumber(row.quantity, row.asset_class === 'CRYPTO' ? 3 : 0, locale) : '--'}
                      </p>
                    </div>
                    <div>
                      <p className="detail-label">Market value</p>
                      <p className="simple-pnl">{currencyText(row.market_value, locale)}</p>
                    </div>
                    <div>
                      <p className="detail-label">Profit / loss</p>
                      <p className={`simple-pnl ${pnlToneClass(row.pnl_pct)}`}>
                        {currencyText(row.pnl_amount, locale)}
                      </p>
                    </div>
                    <div>
                      <p className="detail-label">P/L rate</p>
                      <p className={`simple-pnl ${pnlToneClass(row.pnl_pct)}`}>{signedPercent(row.pnl_pct, locale)}</p>
                    </div>
                  </div>

                  <p className="muted status-line">
                    Cost / Current: {currencyText(row.cost_basis, locale)} / {currencyText(row.current_price, locale)}
                  </p>
                  <p className="muted status-line">{advice.sentence}</p>
                  <p className="muted status-line">{row.reason}</p>

                  <div className="holding-display-actions">
                    <button type="button" className="secondary-btn" disabled title="Demo display only">
                      View Details
                    </button>
                    <button type="button" className="secondary-btn" disabled title="Demo display only">
                      Close Position
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </article>
    </section>
  );
}

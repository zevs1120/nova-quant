import SegmentedControl from './SegmentedControl';
import GlassCard from './GlassCard';
import KpiCard from './KpiCard';

function pct(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return '--';
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

export default function MarketTab({
  market,
  setMarket,
  assetClass,
  setAssetClass,
  modules,
  insights,
  uiMode = 'standard',
  onExplainRisk,
}) {
  const filtered = modules.filter((item) => {
    if (item.asset_class && item.asset_class !== assetClass) return false;
    if (item.market && item.market !== market) return false;
    return true;
  });

  const leaders = insights?.leadership?.leaders || [];
  const laggards = insights?.leadership?.laggards || [];

  return (
    <section className="stack-gap">
      <SegmentedControl
        label="Asset"
        options={[
          { label: 'Options', value: 'OPTIONS' },
          { label: 'Stocks', value: 'US_STOCK' },
          { label: 'Crypto', value: 'CRYPTO' },
        ]}
        value={assetClass}
        onChange={(value) => {
          setAssetClass(value);
          setMarket(value === 'CRYPTO' ? 'CRYPTO' : 'US');
        }}
      />

      <div className="panel-grid panel-grid-2">
        <GlassCard className="velocity-hero">
          <p className="muted">Environment Summary</p>
          <h1 className="velocity-value">{insights?.regime?.tag || '--'}</h1>
          <p className="muted status-line">
            {insights?.short_commentary || insights?.regime?.description || '--'}
          </p>
          <div className="strategy-kpi-row signal-summary-kpis">
            <KpiCard label="Breadth" value={pct(insights?.breadth?.ratio)} />
            <KpiCard label="Volatility" value={insights?.volatility?.label || '--'} />
            <KpiCard label="Risk Bias" value={insights?.risk_on_off?.state || '--'} />
          </div>
          <div className="action-row">
            <button type="button" className="secondary-btn" onClick={onExplainRisk}>
              Why this market stance?
            </button>
          </div>
        </GlassCard>

        <GlassCard>
          <h3 className="card-title">What This Means For Today</h3>
          <ul className="bullet-list">
            <li>If breadth is weak and volatility rises, reduce size first.</li>
            <li>If risk-on improves, prioritize only your best setups.</li>
            <li>Treat this page as evidence for Today, not as a trading terminal.</li>
          </ul>
        </GlassCard>
      </div>

      {uiMode !== 'beginner' ? (
        <GlassCard>
          <h3 className="card-title">Regime Diagnostics</h3>
          <div className="detail-list">
            <div className="detail-row">
              <span className="detail-label">Regime</span>
              <span className="detail-value">{insights?.regime?.tag || '--'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Breadth</span>
              <span className="detail-value">{pct(insights?.breadth?.ratio)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Volatility Environment</span>
              <span className="detail-value">{insights?.volatility?.label || '--'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Style Rotation</span>
              <span className="detail-value">{insights?.style?.preference || '--'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Risk-On / Risk-Off</span>
              <span className="detail-value">{insights?.risk_on_off?.state || '--'}</span>
            </div>
          </div>
        </GlassCard>
      ) : null}

      <GlassCard>
        <h3 className="card-title">Leadership Snapshot</h3>
        <div className="market-module-grid">
          {leaders.map((item) => (
            <div className="market-mini-card" key={`leader-${item.sector}`}>
              <p className="market-line">Leader: {item.sector}</p>
              <p className="muted">20D composite score</p>
              <p className="market-line">{pct(item.score, 2)}</p>
            </div>
          ))}
          {laggards.map((item) => (
            <div className="market-mini-card" key={`lag-${item.sector}`}>
              <p className="market-line">Laggard: {item.sector}</p>
              <p className="muted">20D composite score</p>
              <p className="market-line">{pct(item.score, 2)}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard>
        <h3 className="card-title">Why Today Looks This Way</h3>
        <ul className="bullet-list">
          {(insights?.why_signals_today || []).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </GlassCard>

      {uiMode === 'advanced' ? (
        <GlassCard>
          <h3 className="card-title">Insight Modules (Advanced)</h3>
          <div className="market-module-grid">
            {filtered.map((item) => (
              <div className="market-mini-card" key={item.id}>
                <p className="market-line">{item.title}</p>
                <p className="muted">{item.summary}</p>
                {item.metric ? <p className="market-line">{item.metric}</p> : null}
              </div>
            ))}
          </div>
        </GlassCard>
      ) : null}

      <GlassCard>
        <h3 className="card-title">Data Boundary</h3>
        <p className="muted">
          Insights are generated from sample market data + derived features. They support daily
          decisions but are not live feed claims.
        </p>
      </GlassCard>
    </section>
  );
}

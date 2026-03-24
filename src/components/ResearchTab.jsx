import { useMemo, useState } from 'react';
import SegmentedControl from './SegmentedControl';
import { formatDateTime, formatNumber, formatPercent } from '../utils/format';

const HEALTH_RANK = {
  decaying: 0,
  stable: 1,
  improving: 2,
};

export default function ResearchTab({ research, loading, locale }) {
  const [panel, setPanel] = useState('snapshots');

  const snapshots = research?.daily_snapshots || [];
  const store = research?.store || {};
  const multiAsset = research?.multi_asset || {};
  const diagnostics = research?.diagnostics || {};
  const comparisons = research?.comparisons || [];
  const decisions = research?.promotion_decisions || [];
  const experiments = research?.experiments || [];
  const registrySystem = research?.registry_system || {};
  const paperOps = research?.paper_ops || {};
  const internalIntelligence = research?.internal_intelligence || {};
  const weeklyReview =
    research?.weekly_system_review || internalIntelligence?.weekly_system_review || {};
  const contractChecks = research?.contract_checks || {};
  const datasetGovernance = multiAsset?.dataset_governance || {};
  const dataSnapshots = multiAsset?.derived?.dataset_snapshots || [];
  const dataQuality = multiAsset?.quality_report || {};
  const sourceHealth = multiAsset?.source_health || [];
  const featureManifests = multiAsset?.feature_manifests || {};
  const datasetRegistry = datasetGovernance?.registry || [];
  const datasetQualitySnapshots = datasetGovernance?.snapshots || [];
  const labelManifests = datasetGovernance?.label_manifests || {};
  const paperRuns = paperOps?.daily_runs || [];
  const latestPaperRun = paperRuns[paperRuns.length - 1] || null;

  const latestSnapshot = snapshots[snapshots.length - 1] || null;

  const alphaHealthTop = useMemo(
    () =>
      [...(diagnostics.alpha_health || [])]
        .sort((a, b) => (HEALTH_RANK[b.health] ?? -1) - (HEALTH_RANK[a.health] ?? -1))
        .slice(0, 14),
    [diagnostics.alpha_health],
  );

  return (
    <section className="stack-gap">
      <article className="glass-card">
        <div className="card-header">
          <h3 className="card-title">Internal Research Loop</h3>
          <span className="badge badge-neutral">v1 local store</span>
        </div>
        <div className="status-grid-3">
          <div className="status-box">
            <p className="muted">Snapshots</p>
            <h2>{snapshots.length}</h2>
          </div>
          <div className="status-box">
            <p className="muted">Challengers</p>
            <h2>{research?.challengers?.length || 0}</h2>
          </div>
          <div className="status-box">
            <p className="muted">Experiments</p>
            <h2>{experiments.length}</h2>
          </div>
        </div>
        <div className="status-grid-3">
          <div className="status-box">
            <p className="muted">Stored Runs</p>
            <h2>{store?.runs?.length || 0}</h2>
          </div>
          <div className="status-box">
            <p className="muted">Stored Days</p>
            <h2>{store?.daily_snapshots?.length || 0}</h2>
          </div>
          <div className="status-box">
            <p className="muted">Alpha Daily Rows</p>
            <h2>{store?.alpha_daily_stats?.length || 0}</h2>
          </div>
        </div>
        <div className="status-grid-3">
          <div className="status-box">
            <p className="muted">Multi-Asset Assets</p>
            <h2>{multiAsset?.normalized?.asset_registry?.length || 0}</h2>
          </div>
          <div className="status-box">
            <p className="muted">Training Datasets</p>
            <h2>{multiAsset?.derived?.datasets?.length || 0}</h2>
          </div>
          <div className="status-box">
            <p className="muted">Data Quality</p>
            <h2>{multiAsset?.quality_report?.overall_status || '--'}</h2>
          </div>
        </div>
        <div className="status-grid-3">
          <div className="status-box">
            <p className="muted">Registry Objects</p>
            <h2>
              {(registrySystem?.alpha_registry?.length || 0) +
                (registrySystem?.model_registry?.length || 0) +
                (registrySystem?.strategy_registry?.length || 0)}
            </h2>
          </div>
          <div className="status-box">
            <p className="muted">Paper Daily Runs</p>
            <h2>{paperRuns.length}</h2>
          </div>
          <div className="status-box">
            <p className="muted">Contract Checks</p>
            <h2>{contractChecks?.overall_status || '--'}</h2>
          </div>
        </div>
        <p className="muted status-line">
          Generated at {formatDateTime(research?.generated_at, locale)}
        </p>
        <p className="muted status-line">
          Store updated at {formatDateTime(store?.updated_at, locale)}
        </p>
        <p className="muted status-line">
          Latest: regime={latestSnapshot?.market_regime || '--'}, safety=
          {formatNumber(latestSnapshot?.safety_score, 1, locale)}
        </p>
      </article>

      <SegmentedControl
        label="Research Panel"
        options={[
          { label: 'Daily', value: 'snapshots' },
          { label: 'Data Hub', value: 'multi_asset' },
          { label: 'Alpha Health', value: 'alpha' },
          { label: 'Challenger', value: 'challenger' },
          { label: 'Governance', value: 'governance' },
        ]}
        value={panel}
        onChange={setPanel}
        compact
      />

      {loading ? (
        <article className="glass-card">
          <p className="muted">Loading research loop...</p>
        </article>
      ) : null}

      {panel === 'snapshots' ? (
        <article className="glass-card">
          <h3 className="card-title">Daily Snapshots</h3>
          <p className="muted">
            Daily pipeline output: regime, safety, exposure, selected/filtered counts.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Regime</th>
                  <th>Safety</th>
                  <th>Gross / Net</th>
                  <th>Selected</th>
                  <th>Filtered</th>
                </tr>
              </thead>
              <tbody>
                {snapshots
                  .slice(-20)
                  .reverse()
                  .map((row) => (
                    <tr key={row.date}>
                      <td>{row.date}</td>
                      <td>{row.market_regime}</td>
                      <td>{formatNumber(row.safety_score, 1, locale)}</td>
                      <td>
                        {row.suggested_exposure?.gross}% / {row.suggested_exposure?.net}%
                      </td>
                      <td>{row.selected_opportunities?.length || 0}</td>
                      <td>{row.filtered_opportunities?.length || 0}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {panel === 'alpha' ? (
        <>
          <article className="glass-card">
            <h3 className="card-title">Alpha Health Diagnostics</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Alpha</th>
                    <th>Family</th>
                    <th>Status</th>
                    <th>Health</th>
                    <th>Hit Rate</th>
                    <th>PnL Proxy</th>
                    <th>Decay</th>
                  </tr>
                </thead>
                <tbody>
                  {alphaHealthTop.map((row) => (
                    <tr key={row.alpha_id}>
                      <td>{row.alpha_id}</td>
                      <td>{row.family}</td>
                      <td>{row.status}</td>
                      <td>{row.health}</td>
                      <td>{formatPercent(row.recent_hit_rate, 1)}</td>
                      <td className={row.recent_pnl_proxy >= 0 ? 'positive' : 'negative'}>
                        {formatNumber(row.recent_pnl_proxy, 3, locale)}
                      </td>
                      <td>{row.decay_flag ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="glass-card">
            <h3 className="card-title">Top Failure Reasons</h3>
            <ul className="bullet-list">
              {(diagnostics.top_failure_reasons || []).map((item) => (
                <li key={item.reason}>
                  {item.reason}: {item.count}
                </li>
              ))}
            </ul>
          </article>
        </>
      ) : null}

      {panel === 'multi_asset' ? (
        <>
          <article className="glass-card">
            <h3 className="card-title">Multi-Asset Dataset Snapshots</h3>
            <p className="muted status-line">
              Data sources: equities + options + crypto spot with unified metadata and
              asset-specific schemas.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Dataset</th>
                    <th>Asset Class</th>
                    <th>Date Range</th>
                    <th>Coverage</th>
                    <th>Stale</th>
                    <th>Anomalies</th>
                  </tr>
                </thead>
                <tbody>
                  {(datasetQualitySnapshots.length ? datasetQualitySnapshots : dataSnapshots).map(
                    (row) => (
                      <tr key={row.dataset_id}>
                        <td>{row.dataset_id}</td>
                        <td>{row.asset_class}</td>
                        <td>
                          {row.date_range?.start} → {row.date_range?.end}
                        </td>
                        <td>{formatPercent(row.coverage_summary?.coverage_ratio, 1)}</td>
                        <td>
                          {(row.stale_data_detection || []).some((item) => item.stale)
                            ? 'Yes'
                            : 'No'}
                        </td>
                        <td>{(row.suspicious_anomalies || []).slice(0, 2).join(' / ') || '--'}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="glass-card">
            <h3 className="card-title">Dataset Registry & Label Governance</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Dataset</th>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Split</th>
                    <th>Calendar</th>
                    <th>Label Horizon</th>
                  </tr>
                </thead>
                <tbody>
                  {datasetRegistry.map((row) => (
                    <tr key={row.registry_id || row.dataset_id}>
                      <td>{row.dataset_id}</td>
                      <td>{row.version}</td>
                      <td>{row.status}</td>
                      <td>{row.split_strategy}</td>
                      <td>{row.calendar_mode || '--'}</td>
                      <td>{labelManifests?.[row.asset_class]?.horizon || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="glass-card">
            <h3 className="card-title">Source Health</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Asset</th>
                    <th>Mode</th>
                    <th>Status</th>
                    <th>Age(H)</th>
                    <th>Stale</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceHealth.map((row) => (
                    <tr key={`${row.source}-${row.asset_class}`}>
                      <td>{row.source}</td>
                      <td>{row.asset_class}</td>
                      <td>{row.mode}</td>
                      <td>{row.status}</td>
                      <td>{row.age_hours ?? '--'}</td>
                      <td>{row.stale ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="glass-card">
            <h3 className="card-title">Feature Manifests</h3>
            <div className="detail-list">
              <div className="detail-row">
                <span className="detail-label">Equity</span>
                <span className="detail-value">{(featureManifests.equity || []).length}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Option</span>
                <span className="detail-value">{(featureManifests.option || []).length}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Crypto</span>
                <span className="detail-value">{(featureManifests.crypto || []).length}</span>
              </div>
            </div>
            <p className="muted status-line">
              Equity: {(featureManifests.equity || []).slice(0, 6).join(', ') || '--'}
            </p>
            <p className="muted status-line">
              Option: {(featureManifests.option || []).slice(0, 6).join(', ') || '--'}
            </p>
            <p className="muted status-line">
              Crypto: {(featureManifests.crypto || []).slice(0, 6).join(', ') || '--'}
            </p>
          </article>

          <article className="glass-card">
            <h3 className="card-title">Data Quality Report</h3>
            <p className="muted status-line">
              Overall status: {dataQuality?.overall_status || '--'}
            </p>
            <ul className="bullet-list">
              {(dataQuality?.top_issues?.length
                ? dataQuality.top_issues
                : ['No major blocking issues in current run.']
              ).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="muted status-line">
              Freshness: equity={dataQuality?.latest_data_status?.raw?.equity || '--'} | option=
              {dataQuality?.latest_data_status?.raw?.option || '--'} | crypto=
              {dataQuality?.latest_data_status?.raw?.crypto || '--'}
            </p>
            <p className="muted status-line">
              Boundary:{' '}
              {(multiAsset?.transparency?.real_vs_sample &&
                JSON.stringify(multiAsset.transparency.real_vs_sample)) ||
                '--'}
            </p>
          </article>
        </>
      ) : null}

      {panel === 'challenger' ? (
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
                  <th>Paper Feas.</th>
                  <th>Risk-Adj Δ</th>
                  <th>Overlap</th>
                  <th>Uniqueness</th>
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
                    <td>{formatNumber(cmp.metrics.stability?.challenger, 3, locale)}</td>
                    <td>{formatNumber(cmp.metrics.paper_feasibility?.challenger, 3, locale)}</td>
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
                    <td>{formatPercent(cmp.metrics.uniqueness_vs_champion, 1)}</td>
                    <td>{cmp.promotable ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="muted status-line">
            Paper vs backtest gap: {formatPercent(diagnostics.paper_vs_backtest_gap?.gap, 2, true)}
          </p>
        </article>
      ) : null}

      {panel === 'governance' ? (
        <>
          <article className="glass-card">
            <h3 className="card-title">Version Registry</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Strategy</th>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {(research?.governance?.version_registry || []).map((row) => (
                    <tr key={`${row.strategy_id}-${row.version}`}>
                      <td>{row.strategy_id}</td>
                      <td>{row.version}</td>
                      <td>{row.status}</td>
                      <td>{formatDateTime(row.created_at, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="glass-card">
            <h3 className="card-title">Promotion Decisions</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Challenger</th>
                    <th>From → To</th>
                    <th>Promotable</th>
                    <th>Failure Reasons</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {decisions.map((row) => (
                    <tr key={row.decision_id}>
                      <td>{row.challenger_id}</td>
                      <td>
                        {row.decision?.from_stage || '--'} →{' '}
                        {row.decision?.to_stage || row.status || '--'}
                      </td>
                      <td>{row.promotable ? 'Yes' : 'No'}</td>
                      <td>{(row.failure_reasons || []).slice(0, 2).join(' / ') || '--'}</td>
                      <td>{formatDateTime(row.created_at, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="glass-card">
            <h3 className="card-title">Registry System</h3>
            <div className="status-grid-3">
              <div className="status-box">
                <p className="muted">Alpha Registry</p>
                <h2>{registrySystem?.alpha_registry?.length || 0}</h2>
              </div>
              <div className="status-box">
                <p className="muted">Model Registry</p>
                <h2>{registrySystem?.model_registry?.length || 0}</h2>
              </div>
              <div className="status-box">
                <p className="muted">Strategy Registry</p>
                <h2>{registrySystem?.strategy_registry?.length || 0}</h2>
              </div>
            </div>
            <p className="muted status-line">
              Strategy stages:{' '}
              {(registrySystem?.strategy_registry || [])
                .map((row) => `${row.strategy_id}:${row.current_stage}`)
                .join(' | ') || '--'}
            </p>
          </article>

          <article className="glass-card">
            <h3 className="card-title">Experiment Log</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Experiment</th>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {experiments.map((row) => (
                    <tr key={row.experiment_id}>
                      <td>{row.strategy_id}</td>
                      <td>{row.version_id}</td>
                      <td>{row.status}</td>
                      <td>{row.comparison_summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="glass-card">
            <h3 className="card-title">Paper Trading Ops</h3>
            <p className="muted status-line">
              Daily runs: {paperRuns.length} | Gap:{' '}
              {formatPercent(paperOps?.paper_vs_backtest_gap?.return_gap, 2, true)} | Consistent:{' '}
              {paperOps?.paper_vs_backtest_gap?.consistent ? 'Yes' : 'No'}
            </p>
            <p className="muted status-line">
              Latest run {latestPaperRun?.date || '--'}: orders=
              {latestPaperRun?.orders_count ?? '--'}, fills={latestPaperRun?.fills_count ?? '--'},
              equity={formatNumber(latestPaperRun?.equity_snapshot?.equity, 2, locale)}
            </p>
            <p className="muted status-line">
              Safety guards: exposure=
              {latestPaperRun?.safety_guards?.max_exposure_cap_active ? 'on' : 'off'}, liquidity=
              {latestPaperRun?.safety_guards?.liquidity_check_pass ? 'pass' : 'attention'},
              crypto_always_on=
              {latestPaperRun?.safety_guards?.crypto_always_on_handling ? 'on' : 'off'}
            </p>
          </article>

          <article className="glass-card">
            <h3 className="card-title">Weekly System Review</h3>
            <p className="muted status-line">
              Improved: {(weeklyReview?.what_improved || []).join(', ') || '--'}
            </p>
            <p className="muted status-line">
              Deteriorated: {(weeklyReview?.what_deteriorated || []).join(', ') || '--'}
            </p>
            <p className="muted status-line">
              Interesting challengers:{' '}
              {(weeklyReview?.interesting_challengers || [])
                .map((item) => item.challenger_id)
                .join(', ') || '--'}
            </p>
            <p className="muted status-line">
              Stale datasets: {(weeklyReview?.stale_datasets || []).join(', ') || '--'}
            </p>
            <p className="muted status-line">
              Confidence reduction:{' '}
              {(weeklyReview?.confidence_reduction_areas || []).join(', ') || '--'}
            </p>
          </article>

          <article className="glass-card">
            <h3 className="card-title">Governance Rules</h3>
            <ul className="bullet-list">
              {(research?.governance?.promotion_rules || []).map((rule) => (
                <li key={rule.rule_id || rule.id || rule.rule || JSON.stringify(rule)}>
                  {rule.rule_id || rule.id || 'rule'}:{' '}
                  {rule.from_stage && rule.to_stage
                    ? `${rule.from_stage} -> ${rule.to_stage}`
                    : rule.rule || '--'}{' '}
                  {(rule.checks || []).length ? `| checks: ${rule.checks.join(', ')}` : ''}
                </li>
              ))}
            </ul>
          </article>

          <article className="glass-card">
            <h3 className="card-title">Contract Checks</h3>
            <p className="muted status-line">
              Overall: {contractChecks?.overall_status || '--'} | Invalid objects:{' '}
              {contractChecks?.invalid_objects ?? '--'}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Object</th>
                    <th>Total</th>
                    <th>Invalid</th>
                    <th>Invalid Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {(contractChecks?.checks || []).map((check) => (
                    <tr key={check.type}>
                      <td>{check.type}</td>
                      <td>{check.total}</td>
                      <td>{check.invalid}</td>
                      <td>{formatPercent(check.invalid_ratio, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="glass-card">
            <h3 className="card-title">Object Models</h3>
            <p className="muted status-line">
              {(research?.object_models || []).join(' · ') || '--'}
            </p>
          </article>
        </>
      ) : null}
    </section>
  );
}

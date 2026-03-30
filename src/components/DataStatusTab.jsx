import { useControlPlaneStatus } from '../hooks/useControlPlaneStatus';

export default function DataStatusTab({ data, fetchJson, effectiveUserId }) {
  const runtime = data?.config?.runtime || {};
  const { controlPlane, loading: controlPlaneLoading } = useControlPlaneStatus({
    data,
    fetchJson,
    effectiveUserId,
  });
  const freshnessRows = runtime?.freshness_summary?.rows || [];
  const coverage = runtime?.coverage_summary || {};
  const topIssues = [];
  if (runtime?.source_status !== 'DB_BACKED') {
    topIssues.push('当前运行时并非完整 DB_BACKED，部分对象会降级为 unavailable。');
  }
  if ((runtime?.freshness_summary?.stale_count || 0) > 0) {
    topIssues.push(
      `发现 ${runtime?.freshness_summary?.stale_count} 个资产存在 stale/insufficient 状态。`,
    );
  }
  if ((coverage?.assets_with_bars || 0) === 0) {
    topIssues.push('尚未检测到可用 bars，请先执行 backfill + derive:runtime。');
  }
  if (controlPlane?.search?.status === 'UNAVAILABLE') {
    topIssues.push('搜索资产库未就绪，Browse 搜索会表现为空。');
  }
  if (
    Array.isArray(controlPlane?.runtime) &&
    controlPlane.runtime.every((row) => Number(row?.active_signal_count || 0) === 0)
  ) {
    topIssues.push('两个市场当前都没有 active signals，所以 Today 会退回等待态。');
  }

  return (
    <section className="stack-gap">
      <article className="glass-card">
        <h3 className="card-title">Data Status</h3>
        <p className="muted status-line">
          Overall: {runtime?.source_status || data?.data_status || '--'}
        </p>
        <div className="status-grid-3">
          <div className="status-box">
            <p className="muted">Assets Checked</p>
            <h2>{coverage?.assets_checked ?? '--'}</h2>
          </div>
          <div className="status-box">
            <p className="muted">Bars Coverage</p>
            <h2>{coverage?.assets_with_bars ?? '--'}</h2>
          </div>
          <div className="status-box">
            <p className="muted">Signals Generated</p>
            <h2>{coverage?.generated_signals ?? '--'}</h2>
          </div>
        </div>
        <ul className="bullet-list">
          {(topIssues.length ? topIssues : ['当前未发现阻断级数据问题。'])
            .slice(0, 5)
            .map((item) => (
              <li key={item}>{item}</li>
            ))}
        </ul>
      </article>

      {controlPlane ? (
        <article className="glass-card">
          <h3 className="card-title">Control Plane</h3>
          <p className="muted status-line">As of: {controlPlane.as_of || '--'}</p>
          <div className="status-grid-3">
            <div className="status-box">
              <p className="muted">Search</p>
              <h2>{controlPlane.search?.status || '--'}</h2>
              <p className="muted status-line">
                {controlPlane.search?.live_asset_count ?? '--'} live /{' '}
                {controlPlane.search?.reference_asset_count ?? '--'} reference
              </p>
            </div>
            <div className="status-box">
              <p className="muted">Strategy Factory</p>
              <h2>{controlPlane.strategy_factory?.latest_status || '--'}</h2>
              <p className="muted status-line">
                {controlPlane.strategy_factory?.latest_run_at || 'No run yet'}
              </p>
            </div>
            <div className="status-box">
              <p className="muted">Delivery</p>
              <h2>{controlPlane.delivery?.active_notification_count ?? '--'}</h2>
              <p className="muted status-line">
                {controlPlane.delivery?.latest_notification_at || 'No delivery yet'}
              </p>
            </div>
          </div>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Runtime</th>
                  <th>Signals</th>
                  <th>Decision</th>
                  <th>Top</th>
                </tr>
              </thead>
              <tbody>
                {(controlPlane.runtime || []).map((row) => (
                  <tr key={row.market}>
                    <td>{row.market}</td>
                    <td>{row.source_status}</td>
                    <td>
                      {row.active_signal_count}/{row.signal_count}
                    </td>
                    <td>{row.decision_code}</td>
                    <td>{row.top_action_symbol || '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : controlPlaneLoading ? (
        <article className="glass-card">
          <h3 className="card-title">Control Plane</h3>
          <p className="muted status-line">Control plane 正在按需加载。</p>
        </article>
      ) : null}

      <article className="glass-card">
        <h3 className="card-title">Source Freshness</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Market</th>
                <th>Status</th>
                <th>Age(H)</th>
                <th>Stale</th>
              </tr>
            </thead>
            <tbody>
              {freshnessRows.map((row) => (
                <tr key={`${row.market}-${row.symbol}`}>
                  <td>{row.symbol}</td>
                  <td>{row.market}</td>
                  <td>{row.status}</td>
                  <td>{row.age_hours ?? '--'}</td>
                  <td>{row.status === 'DB_BACKED' ? 'No' : 'Yes'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

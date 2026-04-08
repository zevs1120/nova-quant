import { Fragment, useState } from 'react';
import { useControlPlaneStatus } from '../hooks/useControlPlaneStatus';

function formatDetailValue(value) {
  if (value === null || value === undefined || value === '') return '--';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '--';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatDetailTimestamp(value) {
  if (value === null || value === undefined || value === '') return '--';
  if (typeof value === 'number') return new Date(value).toISOString();
  try {
    return new Date(value).toISOString();
  } catch {
    return String(value);
  }
}

function qualitySeverity(row) {
  const status = String(row?.quality_state_status || '').toUpperCase();
  const reason = String(row?.quality_state_reason || row?.quality_gate_reason || '').toUpperCase();
  if (status === 'QUARANTINED') return 0;
  if (reason === 'PROVIDER_ADJUSTMENT_DRIFT') return 1;
  if (reason === 'CORPORATE_ACTION_SOURCE_CONFLICT') return 2;
  if (status === 'SUSPECT') return 3;
  if (status === 'REPAIRED') return 4;
  if (String(row?.status || '').toUpperCase() !== 'DB_BACKED') return 5;
  return 6;
}

export default function DataStatusTab({ data, fetchJson, effectiveUserId }) {
  const [expandedRowKey, setExpandedRowKey] = useState(null);
  const [detailByRowKey, setDetailByRowKey] = useState({});
  const runtime = data?.config?.runtime || {};
  const { controlPlane, loading: controlPlaneLoading } = useControlPlaneStatus({
    data,
    fetchJson,
    effectiveUserId,
  });
  const freshnessRows = [...(runtime?.freshness_summary?.rows || [])].sort((a, b) => {
    const severityDiff = qualitySeverity(a) - qualitySeverity(b);
    if (severityDiff !== 0) return severityDiff;
    return String(a?.symbol || '').localeCompare(String(b?.symbol || ''));
  });
  const coverage = runtime?.coverage_summary || {};
  const qualitySummary = controlPlane?.quality_summary || {};
  const adjustmentDriftRows = freshnessRows.filter(
    (row) => row?.quality_state_reason === 'PROVIDER_ADJUSTMENT_DRIFT',
  );
  const corporateConflictRows = freshnessRows.filter(
    (row) => row?.quality_state_reason === 'CORPORATE_ACTION_SOURCE_CONFLICT',
  );
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
  if (adjustmentDriftRows.length > 0) {
    topIssues.push(`发现 ${adjustmentDriftRows.length} 个资产存在复权漂移风险。`);
  }
  if (corporateConflictRows.length > 0) {
    topIssues.push(`发现 ${corporateConflictRows.length} 个资产存在公司行为源不一致。`);
  }

  async function toggleRow(row) {
    const rowKey = `${row.market}-${row.symbol}`;
    if (expandedRowKey === rowKey) {
      setExpandedRowKey(null);
      return;
    }
    setExpandedRowKey(rowKey);
    if (!fetchJson || detailByRowKey[rowKey]?.data || detailByRowKey[rowKey]?.loading) return;

    setDetailByRowKey((current) => ({
      ...current,
      [rowKey]: {
        loading: true,
        error: null,
        data: null,
      },
    }));

    try {
      const payload = await fetchJson(
        `/api/admin/data-quality?symbol=${encodeURIComponent(row.symbol)}&market=${encodeURIComponent(row.market)}`,
      );
      setDetailByRowKey((current) => ({
        ...current,
        [rowKey]: {
          loading: false,
          error: null,
          data: payload || null,
        },
      }));
    } catch (error) {
      setDetailByRowKey((current) => ({
        ...current,
        [rowKey]: {
          loading: false,
          error: error instanceof Error ? error.message : 'DETAIL_FETCH_FAILED',
          data: null,
        },
      }));
    }
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
        <div className="status-grid-3" style={{ marginTop: 12 }}>
          <div className="status-box">
            <p className="muted">Suspect</p>
            <h2>{qualitySummary?.suspect_count ?? suspectRowsCount(freshnessRows)}</h2>
            <p className="muted status-line">Rows carrying persisted suspect verdicts</p>
          </div>
          <div className="status-box">
            <p className="muted">Repaired</p>
            <h2>
              {qualitySummary?.repaired_count ??
                freshnessRows.filter((row) => row?.quality_state_status === 'REPAIRED').length}
            </h2>
            <p className="muted status-line">Series repaired by validation workflows</p>
          </div>
          <div className="status-box">
            <p className="muted">Quarantined</p>
            <h2>
              {qualitySummary?.quarantined_count ??
                freshnessRows.filter((row) => row?.quality_state_status === 'QUARANTINED').length}
            </h2>
            <p className="muted status-line">Rows blocked from trusted runtime usage</p>
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
        <div className="status-grid-3" style={{ marginBottom: 12 }}>
          <div className="status-box">
            <p className="muted">Adjustment Drift</p>
            <h2>{qualitySummary?.adjustment_drift_count ?? adjustmentDriftRows.length}</h2>
            <p className="muted status-line">Detected cross-source adjusted drift</p>
          </div>
          <div className="status-box">
            <p className="muted">Corp Action Conflicts</p>
            <h2>
              {qualitySummary?.corporate_action_conflict_count ?? corporateConflictRows.length}
            </h2>
            <p className="muted status-line">Provider mismatch on splits/dividends</p>
          </div>
          <div className="status-box">
            <p className="muted">Quality States</p>
            <h2>{freshnessRows.filter((row) => row?.quality_state_status).length}</h2>
            <p className="muted status-line">Rows with persisted quality verdicts</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Market</th>
                <th>Status</th>
                <th>Age(H)</th>
                <th>Quality</th>
                <th>Reason</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {freshnessRows.map((row) => {
                const rowKey = `${row.market}-${row.symbol}`;
                const isExpanded = expandedRowKey === rowKey;
                const detailState = detailByRowKey[rowKey] || null;
                const detail = detailState?.data?.data?.detail || detailState?.data?.detail || null;
                const metrics = detail?.quality_state_metrics || row?.quality_state_metrics || {};
                const timeline = detail?.timeline || [];
                const governanceRuns = detail?.recent_governance_runs || [];
                const history = detail?.quality_history || [];

                return (
                  <Fragment key={rowKey}>
                    <tr>
                      <td>{row.symbol}</td>
                      <td>{row.market}</td>
                      <td>{row.status}</td>
                      <td>{row.age_hours ?? '--'}</td>
                      <td>{row.quality_state_status || '--'}</td>
                      <td>{row.quality_state_reason || row.quality_gate_reason || '--'}</td>
                      <td>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void toggleRow(row)}
                        >
                          {isExpanded ? 'Hide' : 'Inspect'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr>
                        <td colSpan={7}>
                          {detailState?.loading ? (
                            <p className="muted status-line" style={{ marginTop: 8 }}>
                              Loading symbol drill-down...
                            </p>
                          ) : null}
                          {detailState?.error ? (
                            <p className="muted status-line" style={{ marginTop: 8 }}>
                              Detail load failed: {detailState.error}
                            </p>
                          ) : null}

                          <div className="status-grid-3" style={{ marginTop: 8 }}>
                            <div className="status-box">
                              <p className="muted">Updated</p>
                              <p>
                                {formatDetailTimestamp(
                                  detail?.quality_state_updated_at || row.quality_state_updated_at,
                                )}
                              </p>
                            </div>
                            <div className="status-box">
                              <p className="muted">Corp Actions</p>
                              <p>
                                {detail?.corporate_actions?.length ??
                                  row.recent_corporate_action_count ??
                                  '--'}
                              </p>
                            </div>
                            <div className="status-box">
                              <p className="muted">Calendar Exceptions</p>
                              <p>
                                {detail?.calendar_exceptions?.length ??
                                  row.recent_calendar_exception_count ??
                                  '--'}
                              </p>
                            </div>
                          </div>

                          <div className="status-grid-3" style={{ marginTop: 8 }}>
                            <div className="status-box">
                              <p className="muted">Anomalies</p>
                              <p>{detail?.anomaly_total_count ?? row?.anomaly_total_count ?? '--'}</p>
                            </div>
                            {Object.entries(metrics)
                              .slice(0, 8)
                              .map(([key, value]) => (
                                <div className="status-box" key={key}>
                                  <p className="muted">{key}</p>
                                  <p>{formatDetailValue(value)}</p>
                                </div>
                              ))}
                          </div>

                          {governanceRuns.length ? (
                            <div className="table-wrap" style={{ marginTop: 12 }}>
                              <p className="muted status-line">Recent Governance Runs</p>
                              <table>
                                <thead>
                                  <tr>
                                    <th>Status</th>
                                    <th>Updated</th>
                                    <th>Corp Rows</th>
                                    <th>Mismatches</th>
                                    <th>Calendar Rows</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {governanceRuns.map((run) => (
                                    <tr key={run.id}>
                                      <td>{run.status}</td>
                                      <td>
                                        {formatDetailTimestamp(run.completed_at || run.updated_at)}
                                      </td>
                                      <td>{run.governance_summary?.rows_upserted ?? '--'}</td>
                                      <td>{run.governance_summary?.mismatch_symbols ?? '--'}</td>
                                      <td>
                                        {run.governance_summary?.calendar_rows_upserted ?? '--'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : null}

                          {timeline.length ? (
                            <div className="table-wrap" style={{ marginTop: 12 }}>
                              <p className="muted status-line">Timeline</p>
                              <table>
                                <thead>
                                  <tr>
                                    <th>When</th>
                                    <th>Type</th>
                                    <th>Label</th>
                                    <th>Source</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {timeline.slice(0, 8).map((event) => (
                                    <tr key={`${event.type}-${event.ts}-${event.source || 'NA'}`}>
                                      <td>{formatDetailTimestamp(event.ts)}</td>
                                      <td>{event.type}</td>
                                      <td>{event.label || '--'}</td>
                                      <td>{event.source || '--'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : null}

                          {history.length ? (
                            <div className="table-wrap" style={{ marginTop: 12 }}>
                              <p className="muted status-line">Quality Lifecycle</p>
                              <table>
                                <thead>
                                  <tr>
                                    <th>When</th>
                                    <th>Status</th>
                                    <th>Reason</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {history.slice(0, 8).map((event) => (
                                    <tr key={event.id}>
                                      <td>{formatDetailTimestamp(event.created_at)}</td>
                                      <td>{event.status}</td>
                                      <td>{event.reason || '--'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : null}

                          {detail?.related_audit_events?.length ? (
                            <div className="table-wrap" style={{ marginTop: 12 }}>
                              <p className="muted status-line">Related Workflow Audit Events</p>
                              <table>
                                <thead>
                                  <tr>
                                    <th>Event</th>
                                    <th>When</th>
                                    <th>Entity</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.related_audit_events.slice(0, 5).map((event) => (
                                    <tr key={event.event_id}>
                                      <td>{event.event_type}</td>
                                      <td>{formatDetailTimestamp(event.created_at)}</td>
                                      <td>{event.entity_id || '--'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function suspectRowsCount(rows) {
  return rows.filter((row) => String(row?.quality_state_status || '') === 'SUSPECT').length;
}

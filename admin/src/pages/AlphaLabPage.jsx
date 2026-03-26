import StatCard from '../components/StatCard';
import useAdminResource from '../hooks/useAdminResource';
import { getAdminAlphas } from '../services/adminApi';

function formatMetric(value, digits = 2) {
  if (value === null || value === undefined || value === '') return '-';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toFixed(digits).replace(/\.?0+$/, '');
}

function MixBars({ rows }) {
  const total = rows.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1;
  return (
    <div className="mix-bar-list">
      {rows.map((item) => (
        <div key={item.label} className="mix-bar-row">
          <div className="mix-bar-labels">
            <strong>{item.label}</strong>
            <span>{item.value}</span>
          </div>
          <div className="mix-bar-track">
            <span
              className="mix-bar-fill"
              style={{ width: `${(Number(item.value || 0) / total) * 100}%` }}
            />
          </div>
        </div>
      ))}
      {!rows.length ? <p className="panel-copy">暂无可展示的数据分布。</p> : null}
    </div>
  );
}

function DetailRows({ rows }) {
  return (
    <div className="mix-bar-list">
      {rows.map((item) => (
        <div key={item.label} className="mix-bar-row">
          <div className="mix-bar-labels">
            <strong>{item.label}</strong>
            <span>{item.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function toneForStatus(status) {
  if (status === 'PROD' || status === 'CANARY' || status === 'BACKTEST_PASS') return 'is-green';
  if (status === 'SHADOW' || status === 'DRAFT' || status === 'TODAY') return 'is-blue';
  if (status === 'REJECTED' || status === 'RETIRED') return 'is-red';
  return 'is-amber';
}

function CandidateCards({ rows, emptyText, tone = 'is-blue' }) {
  if (!rows.length) {
    return (
      <article className="insight-card">
        <strong>{emptyText}</strong>
        <p>当前没有可展示的候选记录。</p>
      </article>
    );
  }

  return (
    <div className="candidate-card-list">
      {rows.map((row) => (
        <article key={row.id} className="candidate-card">
          <div className="candidate-card-top">
            <div>
              <strong>{row.family}</strong>
              <p>{row.thesis}</p>
            </div>
            <span className={`status-pill ${tone}`}>{row.status || 'UNKNOWN'}</span>
          </div>
          <div className="candidate-card-metrics">
            <span>接受分 {formatMetric(row.acceptance_score ?? row.latest_acceptance_score, 4)}</span>
            <span>稳定度 {formatMetric(row.stability_score ?? row.metrics?.stability_score, 4)}</span>
            <span>
              相关性 {formatMetric(row.correlation_to_active ?? row.metrics?.correlation_to_active, 4)}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}

function Timeline({ rows, emptyText, renderBody, renderMeta }) {
  return (
    <div className="candidate-timeline">
      {rows.map((row) => (
        <div key={row.id} className="candidate-timeline-item">
          <div>{renderBody(row)}</div>
          <div className="candidate-timeline-meta">{renderMeta(row)}</div>
        </div>
      ))}
      {!rows.length ? <p className="panel-copy">{emptyText}</p> : null}
    </div>
  );
}

export default function AlphaLabPage() {
  const { data, loading, error } = useAdminResource(getAdminAlphas, []);

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h3>正在加载 Alpha 实验室</h3>
          <span className="status-pill is-slate">稍候</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h3>Alpha 数据加载失败</h3>
          <span className="status-pill is-red">异常</span>
        </div>
        <p className="panel-copy">{error}</p>
      </section>
    );
  }

  const inventory = data?.inventory || {};
  const totalCandidates = Object.values(inventory).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  );
  const discoveryToday = data?.today?.recent_acceptances || [];
  const discoveryCards = discoveryToday.map((row) => ({
    id: row.alpha_id,
    family: row.family,
    thesis: `${row.integration_path || 'unknown'} · 今日发现`,
    status: 'TODAY',
    acceptance_score: row.acceptance_score,
    stability_score: null,
    correlation_to_active: null,
  }));
  const controlRows = [
    {
      label: 'Discovery acceptance',
      value: formatMetric(data?.controls?.min_acceptance_score, 2),
    },
    {
      label: 'Shadow admission',
      value: `score ${formatMetric(data?.controls?.shadow_admission_min_acceptance_score, 2)} / DD ${formatMetric(data?.controls?.shadow_admission_max_drawdown, 2)}`,
    },
    {
      label: 'Shadow promotion',
      value: `sample ${formatMetric(data?.controls?.shadow_promotion_min_sample_size, 0)} / sharpe ${formatMetric(data?.controls?.shadow_promotion_min_sharpe, 2)} / expectancy ${formatMetric(data?.controls?.shadow_promotion_min_expectancy, 4)}`,
    },
    {
      label: 'Retirement',
      value: `expectancy ${formatMetric(data?.controls?.retirement_min_expectancy, 4)} / DD ${formatMetric(data?.controls?.retirement_max_drawdown, 2)} / streak ${formatMetric(data?.controls?.retirement_decay_streak_limit, 0)}`,
    },
  ];
  const stats = [
    {
      label: 'Alpha 候选总量',
      value: `${totalCandidates} 个`,
      detail: `当前 SHADOW ${inventory.SHADOW || 0} 个，DRAFT ${inventory.DRAFT || 0} 个。`,
      tone: 'blue',
    },
    {
      label: '今日 Discovery',
      value: `${data?.today?.accepted_count || 0} 个`,
      detail: `今日跑了 ${data?.today?.discovery_runs || 0} 次 discovery，拒绝 ${data?.today?.rejected_count || 0} 个。`,
      tone: 'amber',
    },
    {
      label: '今日 Shadow',
      value: `${data?.today?.candidates_processed || 0} 个`,
      detail: `今日跑了 ${data?.today?.shadow_runs || 0} 次 shadow，评估 ${data?.today?.signals_evaluated || 0} 条信号。`,
      tone: 'green',
    },
    {
      label: '晋升 / 淘汰',
      value: `${data?.today?.promoted_to_canary || 0} / ${data?.today?.retired_count || 0}`,
      detail: `Canary ${inventory.CANARY || 0} 个，Retired ${inventory.RETIRED || 0} 个。`,
      tone: 'red',
    },
  ];

  return (
    <section className="page-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>Alpha 实验室现在看的是什么</h3>
            <p className="panel-copy">
              {data?.data_source?.label || 'Local DB'} · {data?.data_source?.local_date || '今日'} ·{' '}
              {data?.data_source?.timezone || 'Asia/Shanghai'}
            </p>
          </div>
          <span
            className={`status-pill ${
              data?.data_source?.live_connected ? 'is-green' : data?.data_source?.error ? 'is-red' : 'is-slate'
            }`}
          >
            {data?.data_source?.live_connected ? 'EC2 live' : data?.data_source?.label || '本地'}
          </span>
        </div>
        <p className="panel-copy">
          这页现在同时显示当前 Alpha 库存、今日 discovery/shadow 活动和当前闸门设置，不再只看静态库存。
          {data?.data_source?.error ? ` 当前 upstream 异常：${data.data_source.error}` : ''}
        </p>
      </section>

      <div className="stats-grid">
        {stats.map((item) => (
          <StatCard key={item.label} {...item} />
        ))}
      </div>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>今日新发现的 Alpha</h3>
            <span className="status-pill is-amber">Today discovery</span>
          </div>
          <CandidateCards
            rows={discoveryCards.length ? discoveryCards : data?.top_candidates || []}
            emptyText="今天还没有新的 discovery 录用结果"
            tone="is-amber"
          />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>当前重点 Shadow / 衰减</h3>
            <span className="status-pill is-red">Shadow watch</span>
          </div>
          <CandidateCards
            rows={data?.decaying_candidates?.length ? data?.decaying_candidates : data?.top_candidates || []}
            emptyText="当前没有衰减预警候选"
            tone={data?.decaying_candidates?.length ? 'is-red' : 'is-blue'}
          />
        </article>
      </section>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>策略家族分布</h3>
            <span className="status-pill is-blue">发现来源</span>
          </div>
          <MixBars rows={data?.family_mix || []} />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>接线路径分布</h3>
            <span className="status-pill is-green">接入控制</span>
          </div>
          <MixBars rows={data?.integration_mix || []} />
        </article>
      </section>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>当前门槛</h3>
            <span className="status-pill is-slate">Gates</span>
          </div>
          <DetailRows rows={controlRows} />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>相关性地图</h3>
            <span className="status-pill is-slate">与当前活跃 Alpha 的重叠</span>
          </div>
          <div className="mix-bar-list">
            {(data?.correlation_map || []).map((row) => (
              <div key={row.alpha_id} className="mix-bar-row">
                <div className="mix-bar-labels">
                  <strong>{row.family}</strong>
                  <span>{formatMetric(row.correlation_to_active, 4)}</span>
                </div>
                <div className="mix-bar-track">
                  <span
                    className="mix-bar-fill"
                    style={{
                      width: `${Math.max(
                        4,
                        Math.min(100, Number(row.correlation_to_active || 0) * 100),
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            {!data?.correlation_map?.length ? (
              <p className="panel-copy">暂无相关性分析结果。</p>
            ) : null}
          </div>
        </article>
      </section>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>今日 Discovery 轨迹</h3>
            <span className="status-pill is-blue">Workflow log</span>
          </div>
          <Timeline
            rows={data?.today?.recent_discovery_runs || []}
            emptyText="今天还没有 discovery workflow 记录。"
            renderBody={(row) => (
              <>
                <strong>{row.id}</strong>
                <p>
                  录用 {row.accepted}，拒绝 {row.rejected}，watch {row.watchlist}，注册{' '}
                  {row.candidates_registered}。
                </p>
              </>
            )}
            renderMeta={(row) => (
              <>
                <span className={`status-pill ${toneForStatus(row.accepted > 0 ? 'TODAY' : 'DRAFT')}`}>
                  {row.trigger_type}
                </span>
                <span>{row.updated_at || '-'}</span>
              </>
            )}
          />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>今日 Shadow 轨迹</h3>
            <span className="status-pill is-green">Runner log</span>
          </div>
          <Timeline
            rows={data?.today?.recent_shadow_runs || []}
            emptyText="今天还没有 shadow runner 记录。"
            renderBody={(row) => (
              <>
                <strong>{row.id}</strong>
                <p>
                  处理 {row.candidates_processed} 个候选，评估 {row.signals_evaluated} 条信号，晋升{' '}
                  {row.promoted_to_canary}，淘汰 {row.retired}。
                </p>
              </>
            )}
            renderMeta={(row) => (
              <>
                <span className={`status-pill ${toneForStatus(row.promoted_to_canary > 0 ? 'CANARY' : 'SHADOW')}`}>
                  {row.status}
                </span>
                <span>{row.updated_at || '-'}</span>
              </>
            )}
          />
        </article>
      </section>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>状态变更时间线</h3>
            <span className="status-pill is-blue">Lifecycle log</span>
          </div>
          <div className="candidate-timeline">
            {(data?.state_transitions || []).map((row) => (
              <div key={`${row.alpha_id}-${row.created_at}`} className="candidate-timeline-item">
                <div>
                  <strong>{row.alpha_id}</strong>
                  <p>{row.reason || '系统状态变更'}</p>
                </div>
                <div className="candidate-timeline-meta">
                  <span className={`status-pill ${toneForStatus(row.to_status)}`}>{row.to_status}</span>
                  <span>{row.created_at}</span>
                </div>
              </div>
            ))}
            {!data?.state_transitions?.length ? (
              <p className="panel-copy">暂无生命周期事件。</p>
            ) : null}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>今日拒绝记录</h3>
            <span className="status-pill is-red">Reject log</span>
          </div>
          <div className="candidate-timeline">
            {(data?.today?.recent_rejections || []).map((row) => (
              <div key={row.alpha_id} className="candidate-timeline-item">
                <div>
                  <strong>{row.alpha_id}</strong>
                  <p>{row.family}</p>
                </div>
                <div className="candidate-timeline-meta">
                  <span className="status-pill is-red">
                    {row.rejection_reasons?.length ? row.rejection_reasons[0] : 'rejected'}
                  </span>
                  <span>{row.discovered_at || '-'}</span>
                </div>
              </div>
            ))}
            {!data?.today?.recent_rejections?.length ? (
              <p className="panel-copy">今天还没有需要展示的拒绝记录。</p>
            ) : null}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>候选明细</h3>
          <span className="status-pill is-green">真实后台 Registry</span>
        </div>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>候选</th>
                <th>家族 / 状态</th>
                <th>接受分</th>
                <th>核心指标</th>
                <th>拒绝原因</th>
              </tr>
            </thead>
            <tbody>
              {(data?.candidates || []).map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.thesis}</strong>
                    <div className="table-subline">{row.id}</div>
                  </td>
                  <td>
                    {row.family}
                    <div className="table-subline">
                      {row.status} · {row.integration_path}
                    </div>
                  </td>
                  <td>{formatMetric(row.latest_acceptance_score ?? row.acceptance_score, 4)}</td>
                  <td>
                    Sharpe {formatMetric(row.metrics?.sharpe, 4)} · 回撤{' '}
                    {formatMetric(row.metrics?.max_drawdown, 4)}
                    <div className="table-subline">
                      稳定度 {formatMetric(row.metrics?.stability_score, 4)} · 相关性{' '}
                      {formatMetric(row.metrics?.correlation_to_active, 4)} · Shadow sample{' '}
                      {formatMetric(row.shadow?.sample_size, 0)}
                    </div>
                  </td>
                  <td>
                    {row.latest_rejection_reasons?.length
                      ? row.latest_rejection_reasons.join('；')
                      : '通过或未触发拒绝'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

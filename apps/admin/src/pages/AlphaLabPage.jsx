import StatCard from '../components/StatCard';
import useAdminResource from '../hooks/useAdminResource';
import { getAdminAlphas } from '../services/adminApi';

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
            <span className="mix-bar-fill" style={{ width: `${(Number(item.value || 0) / total) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function toneForStatus(status) {
  if (status === 'PROD' || status === 'CANARY' || status === 'BACKTEST_PASS') return 'is-green';
  if (status === 'SHADOW' || status === 'DRAFT') return 'is-blue';
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
            <span>接受分 {row.acceptance_score ?? row.latest_acceptance_score ?? '-'}</span>
            <span>稳定度 {row.stability_score ?? row.metrics?.stability_score ?? '-'}</span>
            <span>相关性 {row.correlation_to_active ?? row.metrics?.correlation_to_active ?? '-'}</span>
          </div>
        </article>
      ))}
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
  const totalCandidates = Object.values(inventory).reduce((sum, value) => sum + Number(value || 0), 0);
  const stats = [
    {
      label: 'Alpha 候选总量',
      value: `${totalCandidates} 个`,
      detail: '包含 DRAFT、SHADOW、CANARY、PROD 等全部生命周期状态。',
      tone: 'blue'
    },
    {
      label: 'Shadow 候选',
      value: `${inventory.SHADOW || 0} 个`,
      detail: '这些候选已接入实时跟踪，但不会直接占用正式资金。',
      tone: 'amber'
    },
    {
      label: 'Canary / Prod',
      value: `${Number(inventory.CANARY || 0) + Number(inventory.PROD || 0)} 个`,
      detail: `CANARY ${inventory.CANARY || 0} 个，PROD ${inventory.PROD || 0} 个。`,
      tone: 'green'
    },
    {
      label: 'Rejected / Retired',
      value: `${Number(inventory.REJECTED || 0) + Number(inventory.RETIRED || 0)} 个`,
      detail: '说明系统确实在淘汰不稳健或衰减的想法，而不是只累积新候选。',
      tone: 'red'
    }
  ];

  return (
    <section className="page-grid">
      <div className="stats-grid">
        {stats.map((item) => (
          <StatCard key={item.label} {...item} />
        ))}
      </div>

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
            <h3>最值得继续观察的候选</h3>
            <span className="status-pill is-amber">Top candidates</span>
          </div>
          <CandidateCards rows={data?.top_candidates || []} emptyText="暂无通过闸门的候选" tone="is-amber" />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>正在衰减的候选</h3>
            <span className="status-pill is-red">Decay watch</span>
          </div>
          <CandidateCards rows={data?.decaying_candidates || []} emptyText="暂无衰减预警候选" tone="is-red" />
        </article>
      </section>

      <section className="page-grid two-up">
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
                  <span>{row.correlation_to_active ?? '-'}</span>
                </div>
                <div className="mix-bar-track">
                  <span
                    className="mix-bar-fill"
                    style={{ width: `${Math.max(4, Math.min(100, Number(row.correlation_to_active || 0) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
            {!data?.correlation_map?.length ? <p className="panel-copy">暂无相关性分析结果。</p> : null}
          </div>
        </article>

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
            {!data?.state_transitions?.length ? <p className="panel-copy">暂无生命周期事件。</p> : null}
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
                    <div className="table-subline">{row.status} · {row.integration_path}</div>
                  </td>
                  <td>{row.latest_acceptance_score ?? row.acceptance_score ?? '-'}</td>
                  <td>
                    Sharpe {row.metrics?.sharpe ?? '-'} · 回撤 {row.metrics?.max_drawdown ?? '-'}
                    <div className="table-subline">稳定度 {row.metrics?.stability_score ?? '-'} · 相关性 {row.metrics?.correlation_to_active ?? '-'}</div>
                  </td>
                  <td>{row.latest_rejection_reasons?.length ? row.latest_rejection_reasons.join('；') : '通过或未触发拒绝'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

import StatCard from '../components/StatCard';
import useAdminResource from '../hooks/useAdminResource';
import { getAdminSignals } from '../services/adminApi';

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

function toneForDirection(direction) {
  if (direction === 'LONG') return 'is-green';
  if (direction === 'SHORT') return 'is-red';
  return 'is-slate';
}

export default function SignalsExecutionPage() {
  const { data, loading, error } = useAdminResource(getAdminSignals, []);

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h3>正在加载信号与执行</h3>
          <span className="status-pill is-slate">稍候</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h3>信号数据加载失败</h3>
          <span className="status-pill is-red">异常</span>
        </div>
        <p className="panel-copy">{error}</p>
      </section>
    );
  }

  const summary = data?.summary || {};
  const execution = data?.execution_summary || {};
  const stats = [
    {
      label: '活跃信号',
      value: `${summary.active_signals || 0} 条`,
      detail: '当前处于 NEW / TRIGGERED 的在线候选信号。',
      tone: 'green'
    },
    {
      label: '平均置信度',
      value: `${Math.round(Number(summary.avg_confidence || 0) * 100)} 分`,
      detail: '这里展示的是当前活跃信号的平均置信度，不是回测收益。',
      tone: 'blue'
    },
    {
      label: 'Paper / Live 执行',
      value: `${execution.paper || 0} / ${execution.live || 0}`,
      detail: `总执行数 ${execution.total || 0}，Live 仍然必须被严格控制。`,
      tone: 'amber'
    },
    {
      label: '平均执行盈亏',
      value: execution.avg_pnl_pct === null ? '暂无' : `${execution.avg_pnl_pct}%`,
      detail: '用于快速判断执行链路是否已经出现明显滑点或退化。',
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
            <h3>方向分布</h3>
            <span className="status-pill is-green">Long / Short</span>
          </div>
          <MixBars rows={summary.direction_mix || []} />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>市场分布</h3>
            <span className="status-pill is-blue">US / Crypto</span>
          </div>
          <MixBars rows={summary.market_mix || []} />
        </article>
      </section>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>最活跃标的热度</h3>
            <span className="status-pill is-amber">Signal heat</span>
          </div>
          <div className="source-card-grid">
            {(summary.top_symbols || []).map((item) => (
              <article key={item.label} className="source-card">
                <strong>{item.label}</strong>
                <p>当前挂着 {item.value} 条活跃信号。</p>
              </article>
            ))}
            {!summary.top_symbols?.length ? (
              <article className="source-card">
                <strong>暂无高热标的</strong>
                <p>当前没有可展示的活跃标的热度。</p>
              </article>
            ) : null}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>最近执行</h3>
            <span className="status-pill is-slate">Execution tape</span>
          </div>
          <div className="candidate-timeline">
            {(data?.recent_executions || []).map((row) => (
              <div key={row.execution_id} className="candidate-timeline-item">
                <div>
                  <strong>{row.symbol}</strong>
                  <p>{row.mode} · {row.action} · {row.signal_id}</p>
                </div>
                <div className="candidate-timeline-meta">
                  <span className={`status-pill ${row.mode === 'LIVE' ? 'is-red' : 'is-blue'}`}>{row.mode}</span>
                  <span>{row.updated_at}</span>
                </div>
              </div>
            ))}
            {!data?.recent_executions?.length ? <p className="panel-copy">暂无执行记录。</p> : null}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>在线信号明细</h3>
          <span className="status-pill is-green">真实信号层</span>
        </div>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>标的</th>
                <th>方向 / 状态</th>
                <th>策略</th>
                <th>置信度 / 分数</th>
                <th>执行情况</th>
                <th>解释 / 因子</th>
              </tr>
            </thead>
            <tbody>
              {(data?.signals || []).map((row) => (
                <tr key={row.signal_id}>
                  <td>
                    <strong>{row.symbol}</strong>
                    <div className="table-subline">{row.market} · {row.asset_class}</div>
                  </td>
                  <td>
                    <span className={`status-pill ${toneForDirection(row.direction)}`}>{row.direction}</span>
                    <div className="table-subline">{row.status}</div>
                  </td>
                  <td>
                    {row.strategy_id}
                    <div className="table-subline">{row.created_at}</div>
                  </td>
                  <td>
                    置信度 {Math.round(Number(row.confidence || 0) * 100)}
                    <div className="table-subline">得分 {row.score}</div>
                  </td>
                  <td>
                    共 {row.execution_count} 次
                    <div className="table-subline">Paper {row.paper_execution_count} · Live {row.live_execution_count}</div>
                  </td>
                  <td>
                    {row.explain || '暂无解释'}
                    <div className="table-subline">{row.factor_tags?.length ? row.factor_tags.join(' · ') : row.tone || '无因子标签'}</div>
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

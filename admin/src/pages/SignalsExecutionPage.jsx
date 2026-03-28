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
            <span
              className="mix-bar-fill"
              style={{ width: `${(Number(item.value || 0) / total) * 100}%` }}
            />
          </div>
        </div>
      ))}
      {!rows.length ? <p className="panel-copy">当前没有可以展示的分布数据。</p> : null}
    </div>
  );
}

function toneForDirection(direction) {
  if (direction === 'LONG') return 'is-green';
  if (direction === 'SHORT') return 'is-red';
  return 'is-slate';
}

function formatPercent(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return `${numeric.toFixed(digits).replace(/\.?0+$/, '')}%`;
}

export default function SignalsExecutionPage() {
  const { data, loading, error } = useAdminResource(getAdminSignals, []);

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h3>正在加载信号执行数据</h3>
          <span className="status-pill is-slate">稍候</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h3>信号执行数据加载失败</h3>
          <span className="status-pill is-red">异常</span>
        </div>
        <p className="panel-copy">{error}</p>
      </section>
    );
  }

  const summary = data?.summary || {};
  const execution = data?.execution_summary || {};
  const topSymbols = (summary.top_symbols || []).map((item) => ({
    label: item.label,
    value: Number(item.value || 0),
  }));
  const focusSignals = [...(data?.signals || [])]
    .sort((left, right) => {
      const liveGap =
        Number(right.live_execution_count || 0) - Number(left.live_execution_count || 0);
      if (liveGap !== 0) return liveGap;
      const executionGap = Number(right.execution_count || 0) - Number(left.execution_count || 0);
      if (executionGap !== 0) return executionGap;
      return Number(left.confidence || 0) - Number(right.confidence || 0);
    })
    .slice(0, 8);

  const stats = [
    {
      label: '活跃信号',
      value: `${summary.active_signals || 0} 条`,
      detail: '当前处于 NEW / TRIGGERED 的在线信号总量。',
      tone: 'green',
    },
    {
      label: '平均置信度',
      value: `${Math.round(Number(summary.avg_confidence || 0) * 100)} 分`,
      detail: '这不是收益，而是当前在线信号的平均把握度。',
      tone: 'blue',
    },
    {
      label: 'Paper / Live',
      value: `${execution.paper || 0} / ${execution.live || 0}`,
      detail: `总执行 ${execution.total || 0} 次，先盯 Live 是否异常放大。`,
      tone: 'amber',
    },
    {
      label: '平均执行盈亏',
      value: execution.avg_pnl_pct === null ? '暂无' : formatPercent(execution.avg_pnl_pct),
      detail: '用于快速判断执行链路是否出现滑点或退化。',
      tone: 'red',
    },
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
            <h3>信号结构</h3>
            <span className="status-pill is-blue">Direction / Market</span>
          </div>
          <div className="panel-split-grid">
            <div className="panel-subsection">
              <p className="panel-subsection-title">方向</p>
              <MixBars rows={summary.direction_mix || []} />
            </div>
            <div className="panel-subsection">
              <p className="panel-subsection-title">市场</p>
              <MixBars rows={summary.market_mix || []} />
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>执行控制台</h3>
            <span className="status-pill is-amber">Execution console</span>
          </div>
          <div className="source-card-grid">
            <article className="source-card">
              <strong>总执行数</strong>
              <p>{execution.total || 0} 次</p>
            </article>
            <article className="source-card">
              <strong>Paper / Live</strong>
              <p>
                {execution.paper || 0} / {execution.live || 0}
              </p>
            </article>
            <article className="source-card">
              <strong>平均执行盈亏</strong>
              <p>
                {execution.avg_pnl_pct === null ? '暂无' : formatPercent(execution.avg_pnl_pct)}
              </p>
            </article>
            <article className="source-card">
              <strong>热点方向</strong>
              <p>{summary.direction_mix?.[0]?.label || '暂无方向脉冲'}</p>
            </article>
          </div>
        </article>
      </section>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>热点标的排行</h3>
            <span className="status-pill is-green">Signal heat</span>
          </div>
          <MixBars rows={topSymbols} />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>最近执行带</h3>
            <span className="status-pill is-slate">Latest tape</span>
          </div>
          <div className="candidate-timeline">
            {(data?.recent_executions || []).slice(0, 8).map((row) => (
              <div key={row.execution_id} className="candidate-timeline-item">
                <div>
                  <strong>{row.symbol}</strong>
                  <p>
                    {row.mode} · {row.action} · {row.signal_id}
                  </p>
                </div>
                <div className="candidate-timeline-meta">
                  <span className={`status-pill ${row.mode === 'LIVE' ? 'is-red' : 'is-blue'}`}>
                    {row.mode}
                  </span>
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
          <h3>优先关注信号</h3>
          <span className="status-pill is-red">Needs review</span>
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
              </tr>
            </thead>
            <tbody>
              {focusSignals.map((row) => (
                <tr key={row.signal_id}>
                  <td>
                    <strong>{row.symbol}</strong>
                    <div className="table-subline">
                      {row.market} · {row.asset_class}
                    </div>
                  </td>
                  <td>
                    <span className={`status-pill ${toneForDirection(row.direction)}`}>
                      {row.direction}
                    </span>
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
                    共 {row.execution_count || 0} 次
                    <div className="table-subline">
                      Paper {row.paper_execution_count || 0} · Live {row.live_execution_count || 0}
                    </div>
                  </td>
                </tr>
              ))}
              {!focusSignals.length ? (
                <tr>
                  <td colSpan="5">当前没有需要优先关注的信号。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

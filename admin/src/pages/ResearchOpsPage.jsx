import StatCard from '../components/StatCard';
import useAdminResource from '../hooks/useAdminResource';
import { getAdminResearchOps } from '../services/adminApi';

function MixBars({ rows, formatter }) {
  const total = rows.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1;
  return (
    <div className="mix-bar-list">
      {rows.map((item) => (
        <div key={item.label} className="mix-bar-row">
          <div className="mix-bar-labels">
            <strong>{item.label}</strong>
            <span>{formatter ? formatter(item.value) : item.value}</span>
          </div>
          <div className="mix-bar-track">
            <span
              className="mix-bar-fill"
              style={{ width: `${(Number(item.value || 0) / total) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatNumber(value, digits = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(numeric);
}

function formatPercent(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return `${formatNumber(numeric * 100, digits)}%`;
}

function formatDateTime(value) {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed);
}

function workflowLabel(key) {
  const labels = {
    free_data_flywheel: 'Free data',
    alpha_discovery_loop: 'Alpha discovery',
    alpha_shadow_runner: 'Shadow runner',
    nova_training_flywheel: 'Nova training',
    nova_strategy_lab: 'Strategy lab',
    quant_evolution_cycle: 'Quant evolution',
  };
  return labels[key] || key;
}

function tableLabel(key) {
  const labels = {
    news_items: '新闻',
    signals: '信号',
    option_chain_snapshots: '期权链',
    fundamental_snapshots: '基本面',
    backtest_runs: '回测 run',
    backtest_metrics: '回测指标',
    dataset_versions: 'Dataset version',
  };
  return labels[key] || key;
}

function evaluationTone(status) {
  if (status === 'PASS') return 'green';
  if (status === 'WATCH') return 'amber';
  if (status === 'REJECT') return 'red';
  return 'blue';
}

function sourceBadgeClass(mode) {
  if (mode === 'live-upstream') return 'is-green';
  if (mode === 'local-fallback') return 'is-red';
  return 'is-slate';
}

export default function ResearchOpsPage() {
  const { data, loading, error } = useAdminResource(getAdminResearchOps, []);

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h3>正在加载今日后台成果</h3>
          <span className="status-pill is-slate">稍候</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h3>今日后台成果加载失败</h3>
          <span className="status-pill is-red">异常</span>
        </div>
        <p className="panel-copy">{error}</p>
      </section>
    );
  }

  const dataSource = data?.data_source || {};
  const daily = data?.daily_ops || {};
  const workflowCounts = Array.isArray(daily.workflow_counts) ? daily.workflow_counts : [];
  const evalSummary = Array.isArray(daily.alpha_eval_summary) ? daily.alpha_eval_summary : [];
  const topBacktests = Array.isArray(daily.top_backtests) ? daily.top_backtests : [];
  const recentSignals = Array.isArray(daily.recent_signals) ? daily.recent_signals : [];
  const recentWorkflows = Array.isArray(daily.recent_workflows) ? daily.recent_workflows : [];
  const training = daily.training || {};

  const workflowTotal = workflowCounts.reduce((sum, row) => sum + Number(row.run_count || 0), 0);
  const freeDataRuns =
    workflowCounts.find((row) => row.workflow_key === 'free_data_flywheel')?.run_count || 0;
  const alphaDiscoveryRuns =
    workflowCounts.find((row) => row.workflow_key === 'alpha_discovery_loop')?.run_count || 0;
  const shadowRuns =
    workflowCounts.find((row) => row.workflow_key === 'alpha_shadow_runner')?.run_count || 0;
  const passCount = evalSummary.find((row) => row.evaluation_status === 'PASS')?.cnt || 0;
  const watchCount = evalSummary.find((row) => row.evaluation_status === 'WATCH')?.cnt || 0;
  const rejectCount = evalSummary.find((row) => row.evaluation_status === 'REJECT')?.cnt || 0;
  const tableCounts = daily.table_counts || {};
  const dataIntakeTotal =
    Number(tableCounts.news_items?.count || 0) +
    Number(tableCounts.option_chain_snapshots?.count || 0) +
    Number(tableCounts.signals?.count || 0);

  const stats = [
    {
      label: '今日工作流',
      value: `${formatNumber(workflowTotal)} 次`,
      detail: `Free data ${formatNumber(freeDataRuns)} 次，Discovery ${formatNumber(alphaDiscoveryRuns)} 次，Shadow ${formatNumber(shadowRuns)} 次。`,
      tone: 'blue',
    },
    {
      label: '今日数据产出',
      value: `${formatNumber(dataIntakeTotal)} 条`,
      detail: `新闻 ${formatNumber(tableCounts.news_items?.count || 0)}，期权链 ${formatNumber(tableCounts.option_chain_snapshots?.count || 0)}，信号 ${formatNumber(tableCounts.signals?.count || 0)}。`,
      tone: 'green',
    },
    {
      label: 'Alpha 评估',
      value: `P ${formatNumber(passCount)} / W ${formatNumber(watchCount)} / R ${formatNumber(rejectCount)}`,
      detail: `今日新增回测 ${formatNumber(tableCounts.backtest_runs?.count || 0)} 个，回测指标 ${formatNumber(tableCounts.backtest_metrics?.count || 0)} 条。`,
      tone: 'amber',
    },
    {
      label: '训练状态',
      value: training.latest_run
        ? `${formatNumber(training.current_dataset_count || 0)} 样本`
        : '今日未训练',
      detail: training.latest_run
        ? `${training.latest_run.status || 'WAIT'} · ${training.latest_execution_reason || 'execution_not_requested'}`
        : `最近一次 ${formatDateTime(training.latest_run_at)}`,
      tone: 'red',
    },
  ];

  const workflowMixRows = workflowCounts.map((row) => ({
    label: workflowLabel(row.workflow_key),
    value: Number(row.run_count || 0),
  }));

  const tableMixRows = Object.entries(tableCounts).map(([key, row]) => ({
    label: tableLabel(key),
    value: Number(row?.count || 0),
  }));

  return (
    <section className="page-grid">
      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>数据来源</h3>
            <span className={`status-pill ${sourceBadgeClass(dataSource.mode)}`}>
              {dataSource.label || '未知来源'}
            </span>
          </div>
          <div className="source-card-grid">
            <article className="source-card">
              <strong>当前口径</strong>
              <p>
                {daily.local_date || dataSource.local_date || '--'} ·{' '}
                {daily.timezone || dataSource.timezone || 'Asia/Shanghai'}
              </p>
            </article>
            <article className="source-card">
              <strong>Upstream</strong>
              <p>{dataSource.upstream_base_url || '未配置，当前直接读本地库'}</p>
            </article>
            <article className="source-card">
              <strong>时间窗起点</strong>
              <p>{formatDateTime(daily.since_utc)}</p>
            </article>
            <article className="source-card">
              <strong>连接状态</strong>
              <p>
                {dataSource.live_connected
                  ? '已连到 EC2 live upstream。'
                  : dataSource.error
                    ? `已回退到本地数据：${dataSource.error}`
                    : '当前展示本地库数据。'}
              </p>
            </article>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>今日 Alpha 结论</h3>
            <span className="status-pill is-blue">Evaluation</span>
          </div>
          <div className="source-card-grid">
            {evalSummary.map((row) => (
              <article key={row.evaluation_status} className="source-card">
                <strong>{row.evaluation_status}</strong>
                <p>
                  {formatNumber(row.cnt)} 个，平均 acceptance {formatNumber(row.avg_acceptance, 4)}
                </p>
                <p>
                  最佳 proxy 收益 {formatPercent(row.best_net_pnl, 1)}，平均 Sharpe{' '}
                  {formatNumber(row.avg_sharpe, 3)}
                </p>
                <span
                  className={`status-pill ${row.evaluation_status === 'PASS' ? 'is-green' : row.evaluation_status === 'WATCH' ? 'is-amber' : 'is-red'}`}
                >
                  {row.evaluation_status}
                </span>
              </article>
            ))}
            {!evalSummary.length ? (
              <p className="panel-copy">今天还没有新的 Alpha 评估结果。</p>
            ) : null}
          </div>
        </article>
      </section>

      <div className="stats-grid">
        {stats.map((item) => (
          <StatCard key={item.label} {...item} />
        ))}
      </div>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>今日工作流分布</h3>
            <span className="status-pill is-green">Workflow runs</span>
          </div>
          <MixBars rows={workflowMixRows} formatter={(value) => `${formatNumber(value)} 次`} />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>今日数据入库分布</h3>
            <span className="status-pill is-amber">Data intake</span>
          </div>
          <MixBars rows={tableMixRows} formatter={(value) => `${formatNumber(value)} 条`} />
        </article>
      </section>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>Top Backtests</h3>
            <span className="status-pill is-blue">Research winners</span>
          </div>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>净收益</th>
                  <th>Sharpe</th>
                  <th>回撤</th>
                  <th>等级</th>
                </tr>
              </thead>
              <tbody>
                {topBacktests.length ? (
                  topBacktests.map((row) => (
                    <tr key={row.backtest_run_id}>
                      <td>
                        <strong>{row.backtest_run_id}</strong>
                        <div className="table-subline">
                          {formatDateTime(row.completed_at || row.started_at)}
                        </div>
                      </td>
                      <td>{formatPercent(row.net_return, 1)}</td>
                      <td>{formatNumber(row.sharpe, 3)}</td>
                      <td>{formatPercent(row.max_dd, 1)}</td>
                      <td>
                        <div>
                          {row.robustness_grade || '--'} / {row.realism_grade || '--'}
                        </div>
                        <div className="table-subline">
                          sample {formatNumber(row.sample_size || 0)}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5">今天还没有新的 backtest 记录。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>最新信号</h3>
            <span className="status-pill is-green">Live signals</span>
          </div>
          <div className="health-route-list">
            {recentSignals.map((row) => (
              <div key={row.signal_id} className="health-route-item">
                <div>
                  <strong>
                    {row.symbol} · {row.direction}
                  </strong>
                  <p>
                    {row.strategy_id}
                    {row.explain ? ` · ${row.explain}` : ''}
                  </p>
                </div>
                <div className="candidate-timeline-meta">
                  <span
                    className={`status-pill ${evaluationTone(row.direction === 'LONG' ? 'PASS' : 'WATCH')}`}
                  >
                    Score {formatNumber(row.score, 2)}
                  </span>
                  <span>{formatDateTime(row.created_at_utc)}</span>
                </div>
              </div>
            ))}
            {!recentSignals.length ? <p className="panel-copy">今天还没有新的信号落库。</p> : null}
          </div>
        </article>
      </section>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>今日工作流时间线</h3>
            <span className="status-pill is-slate">Recent timeline</span>
          </div>
          <div className="candidate-timeline">
            {recentWorkflows.map((row) => (
              <div key={row.id} className="candidate-timeline-item">
                <div>
                  <strong>{workflowLabel(row.workflow_key)}</strong>
                  <p>
                    {row.status} · {row.trigger_type}
                  </p>
                </div>
                <div className="candidate-timeline-meta">
                  {Object.entries(row.summary || {})
                    .slice(0, 2)
                    .map(([key, value]) => (
                      <span key={key}>
                        {key}:{String(value ?? '--')}
                      </span>
                    ))}
                  <span>{formatDateTime(row.updated_at)}</span>
                </div>
              </div>
            ))}
            {!recentWorkflows.length ? (
              <p className="panel-copy">今天还没有工作流运行记录。</p>
            ) : null}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>训练飞轮</h3>
            <span
              className={`status-pill ${training.ready_for_training ? 'is-green' : 'is-amber'}`}
            >
              {training.ready_for_training ? 'Ready' : 'Accumulating'}
            </span>
          </div>
          <div className="source-card-grid">
            <article className="source-card">
              <strong>最近一次训练</strong>
              <p>{formatDateTime(training.latest_run_at)}</p>
            </article>
            <article className="source-card">
              <strong>今日训练次数</strong>
              <p>{formatNumber(training.today_run_count || 0)} 次</p>
            </article>
            <article className="source-card">
              <strong>样本 / 阈值</strong>
              <p>
                {formatNumber(training.current_dataset_count || 0)} /{' '}
                {formatNumber(training.minimum_training_rows || 0)}
              </p>
            </article>
            <article className="source-card">
              <strong>执行状态</strong>
              <p>{training.latest_execution_reason || 'execution_not_requested'}</p>
            </article>
          </div>

          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>Status</th>
                  <th>Trainer</th>
                  <th>样本</th>
                  <th>执行</th>
                </tr>
              </thead>
              <tbody>
                {(training.recent_runs || []).length ? (
                  training.recent_runs.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.updated_at)}</td>
                      <td>{row.status}</td>
                      <td>{row.trainer || '--'}</td>
                      <td>{formatNumber(row.dataset_count || 0)}</td>
                      <td>{row.execution.reason || '--'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5">暂时没有训练飞轮记录。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </section>
  );
}

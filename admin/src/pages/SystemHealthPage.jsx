import StatCard from '../components/StatCard';
import useAdminResource from '../hooks/useAdminResource';
import { getAdminSystem } from '../services/adminApi';

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
      {!rows.length ? <p className="panel-copy">当前没有可展示的健康分布。</p> : null}
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
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed);
}

function toneForStatus(status) {
  if (status === 'SUCCEEDED' || status === 'healthy') return 'is-green';
  if (status === 'WARN' || status === 'degraded' || status === 'RUNNING') return 'is-amber';
  if (status === 'FAILED' || status === 'critical') return 'is-red';
  return 'is-slate';
}

function buildAlerts(dataSource, workflowSummary, diagnostics, recentRuns) {
  const alerts = [];
  const failedWorkflows =
    (workflowSummary.by_status || []).find((row) => row.label === 'FAILED')?.value || 0;
  const runningWorkflows =
    (workflowSummary.by_status || []).find((row) => row.label === 'RUNNING')?.value || 0;
  const failedAiRuns = (recentRuns || []).filter((row) => row.status === 'FAILED');

  if (dataSource.error) {
    alerts.push({
      title: '数据源已回退到本地',
      detail: dataSource.error,
      severity: 'critical',
    });
  }

  if (failedWorkflows) {
    alerts.push({
      title: '后台工作流存在失败',
      detail: `当前失败 ${failedWorkflows} 次，优先排查 discovery、shadow 或 free data 链路。`,
      severity: 'critical',
    });
  }

  if (runningWorkflows) {
    alerts.push({
      title: '有工作流仍在运行中',
      detail: `当前 RUNNING ${runningWorkflows} 次，确认是否正常推进而不是卡住。`,
      severity: 'degraded',
    });
  }

  if (failedAiRuns.length) {
    alerts.push({
      title: '最近 AI 任务有失败',
      detail: `最近 ${failedAiRuns.length} 条 AI 任务失败，先看 ${failedAiRuns[0]?.task_type || 'AI task'}。`,
      severity: 'critical',
    });
  }

  (diagnostics || []).forEach((row) => {
    alerts.push({
      title: row.title,
      detail: row.detail,
      severity: row.severity === 'WARN' ? 'degraded' : 'healthy',
    });
  });

  if (!alerts.length) {
    alerts.push({
      title: '系统主链路稳定',
      detail: '当前没有明显告警，数据源、工作流和 AI 任务都处于可接受状态。',
      severity: 'healthy',
    });
  }

  return alerts.slice(0, 6);
}

export default function SystemHealthPage() {
  const { data, loading, error } = useAdminResource(getAdminSystem, []);

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h3>正在加载系统健康数据</h3>
          <span className="status-pill is-slate">稍候</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h3>系统健康数据加载失败</h3>
          <span className="status-pill is-red">异常</span>
        </div>
        <p className="panel-copy">{error}</p>
      </section>
    );
  }

  const runtime = data?.runtime || {};
  const dataSource = data?.data_source || {};
  const workflowSummary = data?.workflow_summary || {};
  const aiSummary = data?.ai_summary || {};
  const dataSummary = data?.data_summary || {};
  const dailyOps = data?.daily_ops || {};
  const alerts = buildAlerts(
    dataSource,
    workflowSummary,
    data?.diagnostics || [],
    data?.recent_nova_runs || [],
  );
  const routeCount = Array.isArray(runtime.routes) ? runtime.routes.length : 0;
  const workflowTotal = Number(workflowSummary.total || 0);
  const failedWorkflows =
    (workflowSummary.by_status || []).find((row) => row.label === 'FAILED')?.value || 0;
  const failedAiRuns = (data?.recent_nova_runs || []).filter(
    (row) => row.status === 'FAILED',
  ).length;

  const stats = [
    {
      label: '运行模式',
      value: `${runtime.provider || 'unknown'} / ${runtime.mode || 'unknown'}`,
      detail: `当前共有 ${routeCount} 条模型路由别名在运行。`,
      tone: 'blue',
    },
    {
      label: '工作流健康',
      value: `${formatNumber(workflowTotal - failedWorkflows)} / ${formatNumber(workflowTotal)}`,
      detail: `成功或运行中的任务 / 总工作流次数。失败 ${formatNumber(failedWorkflows)} 次。`,
      tone: 'green',
    },
    {
      label: '数据新鲜度',
      value: `${formatNumber(dataSummary.news_items_72h || 0)} / ${formatNumber(dataSummary.news_factor_count || 0)}`,
      detail: `72 小时新闻量 / 已结构化因子量，覆盖率 ${dataSummary.news_factor_coverage_pct || 0}%。`,
      tone: 'amber',
    },
    {
      label: 'AI 任务',
      value: `${formatNumber(aiSummary.total || 0)} 次`,
      detail: `最近失败 ${formatNumber(failedAiRuns)} 次，需要重点看失败和重试。`,
      tone: 'red',
    },
  ];

  const workflowStatusRows = (workflowSummary.by_status || []).map((row) => ({
    label: row.label,
    value: Number(row.value || 0),
  }));
  const workflowMixRows = (workflowSummary.by_workflow || []).map((row) => ({
    label: row.label,
    value: Number(row.value || 0),
  }));

  return (
    <section className="page-grid">
      <div className="stats-grid">
        {stats.map((item) => (
          <StatCard key={item.label} {...item} />
        ))}
      </div>

      <section className="panel">
        <div className="panel-header">
          <h3>当前告警与判断</h3>
          <span className="status-pill is-amber">Alerts first</span>
        </div>
        <div className="health-route-list">
          {alerts.map((row) => (
            <div key={`${row.title}-${row.detail}`} className="health-route-item">
              <div>
                <strong>{row.title}</strong>
                <p>{row.detail}</p>
              </div>
              <span className={`status-pill ${toneForStatus(row.severity)}`}>{row.severity}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>工作流健康</h3>
            <span className="status-pill is-blue">Status / Mix</span>
          </div>
          <div className="panel-split-grid">
            <div className="panel-subsection">
              <p className="panel-subsection-title">状态分布</p>
              <MixBars
                rows={workflowStatusRows}
                formatter={(value) => `${formatNumber(value)} 次`}
              />
            </div>
            <div className="panel-subsection">
              <p className="panel-subsection-title">类型分布</p>
              <MixBars rows={workflowMixRows} formatter={(value) => `${formatNumber(value)} 次`} />
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>数据新鲜度</h3>
            <span
              className={`status-pill ${dataSource.live_connected || dataSource.mode === 'postgres-mirror' ? 'is-green' : dataSource.error ? 'is-red' : 'is-slate'}`}
            >
              {dataSource.label || 'Unknown'}
            </span>
          </div>
          <div className="source-card-grid">
            <article className="source-card">
              <strong>当前口径</strong>
              <p>
                {dailyOps.local_date || dataSource.local_date || '--'} ·{' '}
                {dailyOps.timezone || dataSource.timezone || 'Asia/Shanghai'}
              </p>
            </article>
            <article className="source-card">
              <strong>时间窗起点</strong>
              <p>{formatDateTime(dailyOps.since_utc)}</p>
            </article>
            <article className="source-card">
              <strong>参考数据</strong>
              <p>
                基本面 {formatNumber(dataSummary.fundamentals_count || 0)} · 期权{' '}
                {formatNumber(dataSummary.option_chain_count || 0)}
              </p>
            </article>
            <article className="source-card">
              <strong>结构化因子</strong>
              <p>
                {formatNumber(dataSummary.news_factor_count || 0)} 条 · 覆盖率{' '}
                {dataSummary.news_factor_coverage_pct || 0}%
              </p>
            </article>
          </div>
        </article>
      </section>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>模型与 AI 任务</h3>
            <span className="status-pill is-blue">Runtime / AI</span>
          </div>
          <div className="source-card-grid">
            <article className="source-card">
              <strong>Provider / Mode</strong>
              <p>
                {runtime.provider || 'unknown'} / {runtime.mode || 'unknown'}
              </p>
            </article>
            <article className="source-card">
              <strong>路由别名</strong>
              <p>{formatNumber(routeCount)} 条</p>
            </article>
            <article className="source-card">
              <strong>AI 总调用</strong>
              <p>{formatNumber(aiSummary.total || 0)} 次</p>
            </article>
            <article className="source-card">
              <strong>最近失败</strong>
              <p>{formatNumber(failedAiRuns)} 次</p>
            </article>
          </div>

          <div className="candidate-timeline">
            {(data?.recent_nova_runs || []).slice(0, 6).map((row) => (
              <div key={row.id} className="candidate-timeline-item">
                <div>
                  <strong>{row.task_type}</strong>
                  <p>
                    {row.route_alias || 'unrouted'} · {row.model_name || 'model-unknown'}
                  </p>
                </div>
                <div className="candidate-timeline-meta">
                  <span className={`status-pill ${toneForStatus(row.status)}`}>{row.status}</span>
                  <span>{formatDateTime(row.created_at)}</span>
                </div>
              </div>
            ))}
            {!data?.recent_nova_runs?.length ? (
              <p className="panel-copy">当前没有最近 AI 任务。</p>
            ) : null}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>最近结构化因子样本</h3>
            <span className="status-pill is-amber">Factor feed</span>
          </div>
          <div className="news-factor-list">
            {(data?.recent_news_factors || []).slice(0, 6).map((row) => (
              <article key={row.id} className="news-factor-card">
                <strong>
                  {row.symbol} · {row.source}
                </strong>
                <p>{row.factor_summary || row.headline}</p>
                <div className="news-factor-tags">
                  {(row.factor_tags || []).slice(0, 4).map((tag) => (
                    <span key={tag} className="tag-chip">
                      {tag}
                    </span>
                  ))}
                  {!row.factor_tags?.length ? <span className="tag-chip">无标签</span> : null}
                </div>
              </article>
            ))}
            {!data?.recent_news_factors?.length ? (
              <p className="panel-copy">当前没有最近结构化因子样本。</p>
            ) : null}
          </div>
        </article>
      </section>
    </section>
  );
}

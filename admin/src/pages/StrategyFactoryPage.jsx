import StatCard from '../components/StatCard';
import useAdminResource from '../hooks/useAdminResource';
import { getAdminAlphas, getAdminResearchOps } from '../services/adminApi';

const LIFECYCLE_PALETTE = ['#4b7dff', '#9f75ff', '#ff5fc4', '#ffb199', '#64d2b0', '#8bd4ff'];

function loadStrategyFactory() {
  return Promise.all([getAdminAlphas(), getAdminResearchOps()]).then(
    ([alphaPayload, researchPayload]) => ({
      alpha: alphaPayload?.data ?? alphaPayload ?? null,
      research: researchPayload?.data ?? researchPayload ?? null,
    }),
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

function formatMetric(value, digits = 2) {
  if (value === null || value === undefined || value === '') return '--';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toFixed(digits).replace(/\.?0+$/, '');
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

function workflowLabel(key) {
  const labels = {
    free_data_flywheel: 'Free data',
    alpha_discovery_loop: 'Alpha discovery',
    alpha_shadow_runner: 'Shadow runner',
    nova_training_flywheel: 'Nova training',
    nova_strategy_lab: 'Strategy lab',
    quant_evolution_cycle: 'Quant evolution',
  };
  return labels[key] || key || 'workflow';
}

function toneForStatus(status) {
  if (status === 'PROD' || status === 'CANARY' || status === 'PASS' || status === 'SUCCEEDED') {
    return 'is-green';
  }
  if (status === 'SHADOW' || status === 'TODAY' || status === 'WATCH' || status === 'RUNNING') {
    return 'is-blue';
  }
  if (status === 'REJECTED' || status === 'REJECT' || status === 'FAILED' || status === 'RETIRED') {
    return 'is-red';
  }
  return 'is-amber';
}

function sourceBadgeClass(dataSource) {
  if (dataSource?.live_connected || dataSource?.mode === 'postgres-mirror') return 'is-green';
  if (dataSource?.error) return 'is-red';
  return 'is-slate';
}

function sourceLabel(dataSource) {
  if (dataSource?.live_connected) return 'EC2 live';
  if (dataSource?.mode === 'postgres-mirror') return 'Supabase mirror';
  return dataSource?.label || '本地数据';
}

function LifecycleStack({ rows }) {
  const total = rows.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1;
  return (
    <div className="lifecycle-stack">
      <div className="lifecycle-stack-bar">
        {rows.map((item, index) => (
          <span
            key={item.label}
            className="lifecycle-stack-segment"
            style={{
              width: `${(Number(item.value || 0) / total) * 100}%`,
              background: LIFECYCLE_PALETTE[index % LIFECYCLE_PALETTE.length],
            }}
          />
        ))}
      </div>
      <div className="lifecycle-legend">
        {rows.map((item, index) => (
          <div key={item.label} className="lifecycle-legend-item">
            <span
              className="lifecycle-dot"
              style={{ background: LIFECYCLE_PALETTE[index % LIFECYCLE_PALETTE.length] }}
            />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildUnifiedEvents(alphaData, researchData) {
  const events = [];

  (alphaData?.today?.recent_discovery_runs || []).forEach((row) => {
    events.push({
      id: `discovery-${row.id}`,
      title: 'Discovery',
      summary: `录用 ${row.accepted || 0}，拒绝 ${row.rejected || 0}，watch ${row.watchlist || 0}`,
      status: row.accepted > 0 ? 'TODAY' : 'DRAFT',
      time: row.updated_at,
    });
  });

  (alphaData?.today?.recent_shadow_runs || []).forEach((row) => {
    events.push({
      id: `shadow-${row.id}`,
      title: 'Shadow runner',
      summary: `处理 ${row.candidates_processed || 0} 个候选，晋升 ${row.promoted_to_canary || 0}，淘汰 ${row.retired || 0}`,
      status: row.promoted_to_canary > 0 ? 'CANARY' : 'SHADOW',
      time: row.updated_at,
    });
  });

  (alphaData?.state_transitions || []).forEach((row) => {
    events.push({
      id: `transition-${row.alpha_id}-${row.created_at}`,
      title: row.alpha_id,
      summary: row.reason || `切换到 ${row.to_status}`,
      status: row.to_status,
      time: row.created_at,
    });
  });

  (researchData?.daily_ops?.recent_workflows || []).forEach((row) => {
    events.push({
      id: `workflow-${row.id}`,
      title: workflowLabel(row.workflow_key),
      summary: `${row.status} · ${row.trigger_type || 'manual'}`,
      status: row.status,
      time: row.updated_at,
    });
  });

  return events
    .sort((left, right) => new Date(right.time || 0).getTime() - new Date(left.time || 0).getTime())
    .slice(0, 8);
}

function buildCandidateQueue(alphaData) {
  const queue = [];
  const pushUnique = (row, kind) => {
    const id = row.id || row.alpha_id;
    if (!id || queue.some((item) => item.id === id)) return;
    queue.push({
      id,
      family: row.family || 'Unknown',
      thesis: row.thesis || row.integration_path || '待补充 thesis',
      status: row.status || kind,
      acceptance: row.acceptance_score ?? row.latest_acceptance_score,
      stability: row.stability_score ?? row.metrics?.stability_score,
      correlation: row.correlation_to_active ?? row.metrics?.correlation_to_active,
    });
  };

  (alphaData?.decaying_candidates || []).slice(0, 3).forEach((row) => pushUnique(row, 'REJECT'));

  (alphaData?.today?.recent_acceptances || []).slice(0, 3).forEach((row) =>
    pushUnique(
      {
        id: row.alpha_id,
        family: row.family,
        thesis: `${row.integration_path || 'unknown'} · 今日发现`,
        status: 'TODAY',
        acceptance_score: row.acceptance_score,
      },
      'TODAY',
    ),
  );

  (alphaData?.top_candidates || []).forEach((row) => pushUnique(row, 'SHADOW'));

  return queue.slice(0, 6);
}

export default function StrategyFactoryPage() {
  const { data, loading, error } = useAdminResource(loadStrategyFactory, []);

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h3>正在加载策略工厂</h3>
          <span className="status-pill is-slate">稍候</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h3>策略工厂加载失败</h3>
          <span className="status-pill is-red">异常</span>
        </div>
        <p className="panel-copy">{error}</p>
      </section>
    );
  }

  const alphaData = data?.alpha || {};
  const researchData = data?.research || {};
  const daily = researchData?.daily_ops || {};
  const training = daily.training || {};
  const inventory = alphaData?.inventory || {};
  const totalCandidates = Object.values(inventory).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  );
  const evalSummary = Array.isArray(daily.alpha_eval_summary) ? daily.alpha_eval_summary : [];
  const passCount = evalSummary.find((row) => row.evaluation_status === 'PASS')?.cnt || 0;
  const watchCount = evalSummary.find((row) => row.evaluation_status === 'WATCH')?.cnt || 0;
  const rejectCount = evalSummary.find((row) => row.evaluation_status === 'REJECT')?.cnt || 0;
  const workflowCounts = Array.isArray(daily.workflow_counts) ? daily.workflow_counts : [];
  const discoveryRuns =
    workflowCounts.find((row) => row.workflow_key === 'alpha_discovery_loop')?.run_count || 0;
  const shadowRuns =
    workflowCounts.find((row) => row.workflow_key === 'alpha_shadow_runner')?.run_count || 0;
  const topBacktests = (daily.top_backtests || []).slice(0, 4);
  const unifiedEvents = buildUnifiedEvents(alphaData, researchData);
  const candidateQueue = buildCandidateQueue(alphaData);

  const stats = [
    {
      label: '候选库存',
      value: `${formatNumber(totalCandidates)} 个`,
      detail: `Shadow ${formatNumber(inventory.SHADOW || 0)}，Canary ${formatNumber(inventory.CANARY || 0)}，Prod ${formatNumber(inventory.PROD || 0)}。`,
      tone: 'blue',
    },
    {
      label: '今日发现',
      value: `${formatNumber(alphaData?.today?.accepted_count || 0)} 个`,
      detail: `Discovery ${formatNumber(discoveryRuns)} 次，新增拒绝 ${formatNumber(alphaData?.today?.rejected_count || 0)} 个。`,
      tone: 'amber',
    },
    {
      label: '评估结论',
      value: `P ${formatNumber(passCount)} / W ${formatNumber(watchCount)} / R ${formatNumber(rejectCount)}`,
      detail: `Top backtests ${formatNumber(topBacktests.length)} 个，优先看 PASS 与 WATCH。`,
      tone: 'green',
    },
    {
      label: '训练飞轮',
      value: training.latest_run
        ? `${formatNumber(training.current_dataset_count || 0)} 样本`
        : '未启动',
      detail: training.latest_run
        ? `${training.latest_run.status || 'WAIT'} · ${training.latest_execution_reason || 'execution_not_requested'}`
        : '今天还没有训练记录。',
      tone: 'red',
    },
  ];

  const heroSnapshots = [
    {
      label: '今天的发现',
      value: `${formatNumber(alphaData?.today?.accepted_count || 0)} 个录用`,
      detail: `Discovery ${formatNumber(discoveryRuns)} 次，最新看的是新 family 与新接线路径。`,
    },
    {
      label: '今天的 Shadow',
      value: `${formatNumber(alphaData?.today?.candidates_processed || 0)} 个候选`,
      detail: `Shadow runner ${formatNumber(shadowRuns)} 次，晋升 Canary ${formatNumber(alphaData?.today?.promoted_to_canary || 0)} 个。`,
    },
    {
      label: '今天的评估',
      value: `${formatNumber(passCount)} 个 PASS`,
      detail: `WATCH ${formatNumber(watchCount)} 个，REJECT ${formatNumber(rejectCount)} 个。`,
    },
    {
      label: '训练就绪度',
      value: training.ready_for_training ? 'Ready' : 'Accumulating',
      detail: `${formatNumber(training.current_dataset_count || 0)} / ${formatNumber(training.minimum_training_rows || 0)} 样本阈值。`,
    },
  ];

  return (
    <section className="page-grid">
      <section className="hero-board">
        <div className="hero-copy-card">
          <p className="admin-eyebrow">Strategy Factory</p>
          <h3>从发现到晋升，今天产出了什么</h3>
          <p className="hero-summary">
            这页只回答四件事：新策略进来了多少、评估结果怎么样、哪几个候选最值得盯、训练飞轮是否在向前推。
          </p>
          <div className="hero-chip-row">
            <span className={`status-pill ${sourceBadgeClass(alphaData?.data_source)}`}>
              {sourceLabel(alphaData?.data_source)}
            </span>
            <span className="hero-chip">
              {daily.local_date || alphaData?.data_source?.local_date || '今日'} ·{' '}
              {daily.timezone || alphaData?.data_source?.timezone || 'Asia/Shanghai'}
            </span>
          </div>
          <div className="source-card-grid">
            {heroSnapshots.map((item) => (
              <article key={item.label} className="source-card">
                <strong>{item.label}</strong>
                <p>{item.value}</p>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="hero-visual-card">
          <article className="source-card">
            <strong>Alpha 生命周期</strong>
            <p>先看库存如何从 Discovery 流向 Shadow、Canary 和 Prod，而不是先看细碎日志。</p>
            <LifecycleStack rows={alphaData?.alpha_lifecycle || []} />
          </article>

          <div className="mini-note-grid">
            <article className="mini-note-card tone-soft">
              <p>数据源</p>
              <strong>
                {sourceLabel(alphaData?.data_source)} ·{' '}
                {formatDateTime(alphaData?.data_source?.refreshed_at)}
              </strong>
            </article>
            <article className="mini-note-card tone-dark">
              <p>研究赢家</p>
              <strong>
                {topBacktests.length ? formatPercent(topBacktests[0]?.net_return, 1) : '--'}{' '}
                最高净收益，Sharpe{' '}
                {topBacktests.length ? formatNumber(topBacktests[0]?.sharpe, 3) : '--'}
              </strong>
            </article>
            <article className="mini-note-card tone-soft">
              <p>训练状态</p>
              <strong>
                {training.latest_run?.status || 'IDLE'} ·{' '}
                {training.latest_execution_reason || 'execution_not_requested'}
              </strong>
            </article>
          </div>
        </div>
      </section>

      <div className="stats-grid">
        {stats.map((item) => (
          <StatCard key={item.label} {...item} />
        ))}
      </div>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>研究赢家</h3>
            <span className="status-pill is-blue">Top backtests</span>
          </div>
          <div className="source-card-grid">
            {topBacktests.map((row) => (
              <article key={row.backtest_run_id} className="source-card">
                <strong>{row.backtest_run_id}</strong>
                <p>
                  净收益 {formatPercent(row.net_return, 1)} · Sharpe {formatNumber(row.sharpe, 3)}
                </p>
                <p>
                  回撤 {formatPercent(row.max_dd, 1)} · {row.robustness_grade || '--'} /{' '}
                  {row.realism_grade || '--'}
                </p>
              </article>
            ))}
            {!topBacktests.length ? (
              <article className="source-card">
                <strong>今天还没有新的回测赢家</strong>
                <p>等下一轮研究产出后，这里会自动显示最值得看的 run。</p>
              </article>
            ) : null}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>统一事件流</h3>
            <span className="status-pill is-slate">Discovery / Shadow / Workflow</span>
          </div>
          <div className="candidate-timeline">
            {unifiedEvents.map((row) => (
              <div key={row.id} className="candidate-timeline-item">
                <div>
                  <strong>{row.title}</strong>
                  <p>{row.summary}</p>
                </div>
                <div className="candidate-timeline-meta">
                  <span className={`status-pill ${toneForStatus(row.status)}`}>{row.status}</span>
                  <span>{formatDateTime(row.time)}</span>
                </div>
              </div>
            ))}
            {!unifiedEvents.length ? (
              <p className="panel-copy">今天还没有新的策略工厂事件。</p>
            ) : null}
          </div>
        </article>
      </section>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>重点候选队列</h3>
            <span className="status-pill is-amber">Watch next</span>
          </div>
          <div className="candidate-card-list">
            {candidateQueue.map((row) => (
              <article key={row.id} className="candidate-card">
                <div className="candidate-card-top">
                  <div>
                    <strong>{row.family}</strong>
                    <p>{row.thesis}</p>
                  </div>
                  <span className={`status-pill ${toneForStatus(row.status)}`}>{row.status}</span>
                </div>
                <div className="candidate-card-metrics">
                  <span>接受分 {formatMetric(row.acceptance, 4)}</span>
                  <span>稳定度 {formatMetric(row.stability, 4)}</span>
                  <span>相关性 {formatMetric(row.correlation, 4)}</span>
                </div>
              </article>
            ))}
            {!candidateQueue.length ? (
              <article className="insight-card">
                <strong>当前没有需要重点排队的候选</strong>
                <p>等新的 Discovery、Shadow 或衰减告警出现后，这里会给出下一批候选。</p>
              </article>
            ) : null}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>训练就绪</h3>
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

          <div className="candidate-timeline">
            {(training.recent_runs || []).slice(0, 4).map((row) => (
              <div key={row.id} className="candidate-timeline-item">
                <div>
                  <strong>{row.trainer || 'trainer-unknown'}</strong>
                  <p>
                    样本 {formatNumber(row.dataset_count || 0)} · {row.execution?.reason || '--'}
                  </p>
                </div>
                <div className="candidate-timeline-meta">
                  <span className={`status-pill ${toneForStatus(row.status)}`}>{row.status}</span>
                  <span>{formatDateTime(row.updated_at)}</span>
                </div>
              </div>
            ))}
            {!training.recent_runs?.length ? (
              <p className="panel-copy">暂时没有训练飞轮记录。</p>
            ) : null}
          </div>
        </article>
      </section>
    </section>
  );
}

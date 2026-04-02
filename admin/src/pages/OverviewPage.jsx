import StatCard from '../components/StatCard';
import useAdminResource from '../hooks/useAdminResource';
import { getAdminOverview, getAdminOverviewHeadline } from '../services/adminApi';

const LIFECYCLE_PALETTE = ['#4b7dff', '#9f75ff', '#ff5fc4', '#ffb199', '#64d2b0', '#8bd4ff'];

// Thresholds for priority alerts
// Shadow inventory pile-up: Shadow > Canary * 3 + 6 indicates slow promotion cadence
const SHADOW_PILEUP_MULTIPLIER = 3;
const SHADOW_PILEUP_PAD = 6;
// Active user ratio below this % triggers low-activation alert
const LOW_ACTIVATION_THRESHOLD_PCT = 30;

function getQlibBridgeState(headline) {
  if (headline?.qlib_bridge_state) return headline.qlib_bridge_state;
  if (!headline?.qlib_bridge_enabled) return 'disabled';
  if (!headline?.qlib_bridge_healthy) return 'offline';
  if (headline?.qlib_bridge_ready === false) return 'data_not_ready';
  return 'online';
}

function getQlibBridgeStatusLabel(state) {
  if (state === 'online') return '✅ 在线';
  if (state === 'data_not_ready') return '⚠️ 数据未就绪';
  if (state === 'offline') return '❌ 离线';
  return '未启用';
}

function getQlibBridgeStatusShortLabel(state) {
  if (state === 'online') return '✅';
  if (state === 'data_not_ready') return '⚠️';
  if (state === 'offline') return '❌';
  return '未启用';
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

function priorityTone(level) {
  if (level === 'risk') return '需要处理';
  if (level === 'watch') return '需要关注';
  return '运行正常';
}

function priorityClass(level) {
  if (level === 'risk') return 'is-red';
  if (level === 'watch') return 'is-amber';
  return 'is-green';
}

function buildPriorityItems(headline, workflowTimeline, activeUserRatio) {
  const failedWorkflows = (workflowTimeline || []).filter((item) => item.status === 'FAILED');
  const qlibBridgeState = getQlibBridgeState(headline);
  const items = [];

  if (failedWorkflows.length) {
    items.push({
      title: '后台工作流有失败任务',
      detail: `最近 ${failedWorkflows.length} 个任务失败，先看 ${failedWorkflows[0]?.workflow_key || 'workflow'}。`,
      level: 'risk',
    });
  }

  if (
    Number(headline.shadow_candidates || 0) >
    Number(headline.canary_candidates || 0) * SHADOW_PILEUP_MULTIPLIER + SHADOW_PILEUP_PAD
  ) {
    items.push({
      title: 'Shadow 库存堆积',
      detail: `Shadow ${headline.shadow_candidates || 0} 个，Canary ${headline.canary_candidates || 0} 个，晋升节奏偏慢。`,
      level: 'watch',
    });
  }

  if (activeUserRatio < LOW_ACTIVATION_THRESHOLD_PCT) {
    items.push({
      title: '活跃率偏低',
      detail: `近 7 天活跃率只有 ${Math.round(activeUserRatio)}%，需要回到用户激活与触达链路。`,
      level: 'watch',
    });
  }

  if (!Number(headline.active_signals || 0)) {
    items.push({
      title: '当前没有在线信号',
      detail: '如果这不是预期状态，优先检查研究、信号生成与上游数据链路。',
      level: 'risk',
    });
  }

  if (qlibBridgeState === 'offline') {
    items.push({
      title: 'Qlib Bridge 不可达',
      detail: 'Qlib 因子引擎已启用但健康检查失败，因子增强当前不可用。',
      level: 'watch',
    });
  }

  if (qlibBridgeState === 'data_not_ready') {
    items.push({
      title: 'Qlib 数据未就绪',
      detail: 'Bridge 已在线，但 Qlib 核心尚未初始化；先完成数据同步再看因子和模型结果。',
      level: 'watch',
    });
  }

  if (!items.length) {
    items.push({
      title: '平台主链路稳定',
      detail: '当前没有明显的工作流失败或库存堵点，可以继续看二级页面做精细判断。',
      level: 'good',
    });
  }

  return items.slice(0, 3);
}

function workflowTone(status) {
  if (status === 'SUCCEEDED') return 'is-green';
  if (status === 'FAILED') return 'is-red';
  return 'is-slate';
}

function LoadingBlock() {
  return (
    <section className="panel">
      <div className="panel-header">
        <h3>正在加载总览数据</h3>
        <span className="status-pill is-slate">稍候</span>
      </div>
      <p className="panel-copy">正在从管理员 API 拉取用户、策略、信号与工作流脉冲。</p>
    </section>
  );
}

export default function OverviewPage() {
  const {
    data: headlineData,
    loading: headlineLoading,
    error: headlineError,
  } = useAdminResource(getAdminOverviewHeadline, []);
  const {
    data: fullData,
    loading: fullLoading,
    error: fullError,
  } = useAdminResource(getAdminOverview, []);

  // Prefer full data; fall back to headline for fast first paint
  const data = fullData || headlineData;
  const isPartial = !fullData && !!headlineData;
  const anyLoading = headlineLoading || fullLoading;

  // Show spinner only when we have no data and at least one request is still in flight
  if (!data && anyLoading) return <LoadingBlock />;

  // Show error only when we have no data and both requests have settled
  if (!data && !anyLoading) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h3>总览加载失败</h3>
          <span className="status-pill is-red">异常</span>
        </div>
        <p className="panel-copy">管理员后台总览接口暂时不可用：{headlineError || fullError}</p>
      </section>
    );
  }

  // Partial data showing but full overview permanently failed -- warn the user
  const fullLoadFailed = isPartial && !fullLoading && !!fullError;

  const headline = data?.headline_metrics || {};
  const workflowTimeline = (data?.workflow_timeline || []).slice(0, 5);
  const qlibBridgeState = getQlibBridgeState(headline);
  const qlibBridgeStatusLabel = getQlibBridgeStatusLabel(qlibBridgeState);
  const qlibBridgeStatusShortLabel = getQlibBridgeStatusShortLabel(qlibBridgeState);
  const activeUserRatio = headline.total_users
    ? (Number(headline.active_users_7d || 0) / Number(headline.total_users || 1)) * 100
    : 0;

  const stats = [
    {
      label: '近 7 天活跃率',
      value: `${Math.round(activeUserRatio)}%`,
      detail: `活跃 ${headline.active_users_7d || 0} / 总用户 ${headline.total_users || 0}。`,
      tone: 'blue',
    },
    {
      label: '在线信号',
      value: `${headline.active_signals || 0} 条`,
      detail: '当前处于 NEW / TRIGGERED 的在线信号总量。',
      tone: 'green',
    },
    {
      label: '策略库存',
      value: isPartial
        ? '...'
        : `${headline.shadow_candidates || 0} / ${headline.canary_candidates || 0}`,
      detail: isPartial
        ? '正在加载策略数据...'
        : '前者是 Shadow，后者是 Canary，用来看晋升是否堵塞。',
      tone: 'amber',
    },
    {
      label: 'AI 与因子',
      value: isPartial ? '...' : `${headline.ai_runs || 0} / ${headline.recent_news_factors || 0}`,
      detail: isPartial
        ? qlibBridgeState === 'disabled'
          ? '正在加载 AI 运行数据...'
          : `AI 运行数据加载中。Qlib Bridge ${qlibBridgeStatusLabel}`
        : qlibBridgeState === 'disabled'
          ? '最近 AI 运行次数 / 结构化新闻因子沉淀量。Qlib 未启用'
          : `AI ${headline.ai_runs || 0} 次 / 新闻因子 ${headline.recent_news_factors || 0} 条。Qlib Bridge ${qlibBridgeStatusLabel}`,
      tone: 'red',
    },
  ];

  const domainCards = [
    {
      label: '用户层',
      value: `${headline.total_users || 0} 个账户`,
      detail: `近 7 天活跃 ${headline.active_users_7d || 0} 个。`,
    },
    {
      label: '策略层',
      value: isPartial ? '加载中...' : `${headline.shadow_candidates || 0} 个候选`,
      detail: isPartial
        ? '正在拉取策略库存数据。'
        : `Canary ${headline.canary_candidates || 0} 个，在线信号 ${headline.active_signals || 0} 条。`,
    },
    {
      label: '执行层',
      value: `${(data?.top_symbols || []).slice(0, 1)[0]?.label || '暂无热点'}`,
      detail: (data?.top_symbols || []).length
        ? `当前最活跃标的挂着 ${(data?.top_symbols || [])[0]?.value || 0} 条信号。`
        : '当前没有需要特别关注的热标的。',
    },
    {
      label: '系统层',
      value: workflowTimeline.length ? `${workflowTimeline.length} 条最新动态` : '暂无动态',
      detail: workflowTimeline.length
        ? `最近一条来自 ${workflowTimeline[0]?.workflow_key || 'workflow'}。 Qlib Bridge ${qlibBridgeStatusShortLabel}`
        : `等待新的后台任务脉冲。Qlib Bridge ${qlibBridgeStatusShortLabel}`,
    },
  ];

  const priorityItems = buildPriorityItems(headline, workflowTimeline, activeUserRatio);

  return (
    <section className="page-grid overview-page">
      {fullLoadFailed ? (
        <article className="panel" style={{ marginBottom: '1rem' }}>
          <div className="panel-header">
            <h3>完整数据加载失败</h3>
            <span className="status-pill is-amber">部分数据</span>
          </div>
          <p className="panel-copy">
            策略与 AI 模块数据拉取失败（{fullError}），当前展示的是本地快速指标。刷新页面重试。
          </p>
        </article>
      ) : null}
      <section className="hero-board">
        <div className="hero-copy-card">
          <p className="admin-eyebrow">Overview</p>
          <h3>先看结果，再决定去哪一页深挖</h3>
          <p className="hero-summary">
            总览页现在只负责给出今天平台的脉冲和风险提示，不再重复展示各二级页的细节分布。
          </p>

          <div className="story-list">
            {priorityItems.map((item) => (
              <article key={item.title} className="story-item">
                <div className="story-item-header">
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <div className={`status-pill ${priorityClass(item.level)}`}>
                    {priorityTone(item.level)}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="hero-visual-card">
          <div className="source-card-grid">
            {domainCards.map((item) => (
              <article key={item.label} className="source-card">
                <strong>{item.label}</strong>
                <p>{item.value}</p>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>

          <div className="mini-note-grid">
            <article className="mini-note-card tone-soft">
              <p>今日看板原则</p>
              <strong>只保留跨域结果，不在这里重复用户、信号和健康页的细分图。</strong>
            </article>
            <article className="mini-note-card tone-dark">
              <p>动作建议</p>
              <strong>先读异常，再去对应二级页下钻，而不是在总览里读完所有明细。</strong>
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
        <article className="panel panel-hero">
          <div className="panel-header">
            <h3>策略生命周期结构</h3>
            <span className="status-pill is-green">Strategy inventory</span>
          </div>
          {isPartial && !(data?.alpha_lifecycle || []).length ? (
            <p className="panel-copy">正在加载策略生命周期数据...</p>
          ) : (
            <LifecycleStack rows={data?.alpha_lifecycle || []} />
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>最新工作流动态</h3>
            <span className="status-pill is-blue">Workflow pulse</span>
          </div>
          <div className="candidate-timeline">
            {workflowTimeline.map((item) => (
              <div
                key={`${item.workflow_key}-${item.updated_at}`}
                className="candidate-timeline-item"
              >
                <div>
                  <strong>{item.workflow_key}</strong>
                  <p>{item.summary || item.status || '后台任务更新'}</p>
                </div>
                <div className="candidate-timeline-meta">
                  <span className={`status-pill ${workflowTone(item.status)}`}>{item.status}</span>
                  <span>{item.updated_at}</span>
                </div>
              </div>
            ))}
            {!workflowTimeline.length ? (
              <p className="panel-copy">当前没有新的后台任务动态。</p>
            ) : null}
          </div>
        </article>
      </section>
    </section>
  );
}

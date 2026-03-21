import StatCard from '../components/StatCard';
import useAdminResource from '../hooks/useAdminResource';
import { getAdminOverview } from '../services/adminApi';

function RingMeter({ value, label, note, accent }) {
  return (
    <div className="ring-card">
      <div
        className="ring-meter"
        style={{
          '--ring-value': `${Math.max(0, Math.min(Number(value || 0), 100)) * 3.6}deg`,
          '--ring-accent': accent
        }}
      >
        <div className="ring-meter-inner">
          <strong>{Math.round(Number(value || 0))}%</strong>
          <span>{label}</span>
        </div>
      </div>
      <p className="ring-note">{note}</p>
    </div>
  );
}

function GuardrailBars({ rows }) {
  return (
    <div className="guardrail-bars">
      {rows.map((item) => (
        <div key={item.label} className="guardrail-item">
          <div className="guardrail-bar-track">
            <span className="guardrail-bar-fill" style={{ height: `${item.value}%` }} />
          </div>
          <strong>{Math.round(Number(item.value || 0))}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function LifecycleStack({ rows }) {
  const total = rows.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1;
  const palette = ['#c8b089', '#ef8d56', '#1f1f1f', '#5e7f69', '#7a6e61', '#d8cfc1', '#b86e54'];
  return (
    <div className="lifecycle-stack">
      <div className="lifecycle-stack-bar">
        {rows.map((item, index) => (
          <span
            key={item.label}
            className="lifecycle-stack-segment"
            style={{ width: `${(Number(item.value || 0) / total) * 100}%`, background: palette[index % palette.length] }}
          />
        ))}
      </div>
      <div className="lifecycle-legend">
        {rows.map((item, index) => (
          <div key={item.label} className="lifecycle-legend-item">
            <span className="lifecycle-dot" style={{ background: palette[index % palette.length] }} />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function StoryProgress({ rows }) {
  return (
    <div className="story-list">
      {rows.map((item) => (
        <article key={item.title} className="story-item">
          <div className="story-item-header">
            <div>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </div>
            <span>{item.value}</span>
          </div>
          <div className="story-progress">
            <span style={{ width: `${item.progress}%` }} />
          </div>
        </article>
      ))}
    </div>
  );
}

function LoadingBlock() {
  return (
    <section className="panel">
      <div className="panel-header">
        <h3>正在加载总览数据</h3>
        <span className="status-pill is-slate">稍候</span>
      </div>
      <p className="panel-copy">正在从管理员 API 拉取用户、Alpha、信号和系统健康数据。</p>
    </section>
  );
}

export default function OverviewPage() {
  const { data, loading, error } = useAdminResource(getAdminOverview, []);

  if (loading) return <LoadingBlock />;

  if (error) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h3>总览加载失败</h3>
          <span className="status-pill is-red">异常</span>
        </div>
        <p className="panel-copy">管理员后台总览接口暂时不可用：{error}</p>
      </section>
    );
  }

  const headline = data?.headline_metrics || {};
  const stats = [
    {
      label: '注册用户',
      value: `${headline.total_users || 0} 个`,
      detail: `近 7 天活跃 ${headline.active_users_7d || 0} 个。`,
      tone: 'blue'
    },
    {
      label: '在线信号',
      value: `${headline.active_signals || 0} 条`,
      detail: '后台当前处于 NEW / TRIGGERED 的策略信号总量。',
      tone: 'green'
    },
    {
      label: 'Shadow 候选',
      value: `${headline.shadow_candidates || 0} 个`,
      detail: `Canary ${headline.canary_candidates || 0} 个，说明新策略仍受严格晋升控制。`,
      tone: 'amber'
    },
    {
      label: 'AI 与因子',
      value: `${headline.ai_runs || 0} 次 AI 运行`,
      detail: `最近沉淀新闻因子 ${headline.recent_news_factors || 0} 条。`,
      tone: 'red'
    }
  ];

  const storyRows = (data?.data_story || []).map((item, index) => ({
    title: item.label,
    description: item.detail,
    value: item.value,
    progress: [86, 72, 79][index] || 68
  }));

  const topSymbols = (data?.top_symbols || []).slice(0, 5);

  return (
    <section className="page-grid overview-page">
      <section className="hero-board">
        <div className="hero-copy-card">
          <p className="admin-eyebrow">Investor View</p>
          <h3>把用户、策略、因子和 AI 一次性放进同一张可读总览</h3>
          <p className="hero-summary">
            这里展示的不是原始日志，而是运营层、策略层和 AI 层的压缩视图。投资人可以一眼看出用户增长、策略发现、风控闸门和 AI 活跃度是不是在同步推进。
          </p>

          <div className="hero-chip-row">
            <span className="hero-chip">用户数据已接入</span>
            <span className="hero-chip">Alpha 生命周期已接入</span>
            <span className="hero-chip">信号执行已接入</span>
            <span className="hero-chip">因子 / AI 已接入</span>
          </div>

          <StoryProgress rows={storyRows} />
        </div>

        <div className="hero-visual-card">
          <RingMeter
            value={Math.min(100, ((headline.shadow_candidates || 0) + (headline.canary_candidates || 0) * 2) * 12)}
            label="策略治理指数"
            note="新发现的策略大部分仍停留在 SHADOW / CANARY，说明系统没有绕过风控闸门。"
            accent="#ef8d56"
          />

          <div className="mini-note-grid">
            <article className="mini-note-card tone-soft">
              <p>用户层</p>
              <strong>{headline.total_users || 0} 个账户正在被这套系统服务</strong>
            </article>
            <article className="mini-note-card tone-dark">
              <p>策略层</p>
              <strong>{headline.active_signals || 0} 条在线信号，{headline.shadow_candidates || 0} 个影子候选</strong>
            </article>
            <article className="mini-note-card tone-soft">
              <p>AI 层</p>
              <strong>{headline.ai_runs || 0} 次最近 AI 运行，{headline.recent_news_factors || 0} 条因子沉淀</strong>
            </article>
          </div>
        </div>
      </section>

      <div className="stats-grid">
        {stats.map((item) => (
          <StatCard key={item.label} {...item} />
        ))}
      </div>

      <section className="overview-visual-grid">
        <article className="panel panel-hero">
          <div className="panel-header">
            <h3>Alpha 生命周期分布</h3>
            <span className="status-pill is-green">来自真实后台数据</span>
          </div>
          <p className="panel-copy">如果系统健康，绝大多数新想法会停留在 DRAFT / SHADOW，真正进入 PROD 的比例必须极低。</p>
          <LifecycleStack rows={data?.alpha_lifecycle || []} />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>风险闸门强度</h3>
            <span className="status-pill is-blue">治理视图</span>
          </div>
          <p className="panel-copy">把复杂的模型治理问题压缩成 5 个投资人能读懂的闸门强度指标。</p>
          <GuardrailBars rows={data?.guardrails || []} />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>当前最活跃标的</h3>
            <span className="status-pill is-amber">信号热度</span>
          </div>
          <div className="source-card-grid">
            {topSymbols.map((item) => (
              <article key={item.label} className="source-card">
                <strong>{item.label}</strong>
                <p>当前活跃信号数量：{item.value}</p>
              </article>
            ))}
            {!topSymbols.length ? (
              <article className="source-card">
                <strong>暂无活跃标的</strong>
                <p>当前没有可展示的实时信号热度。</p>
              </article>
            ) : null}
          </div>
        </article>
      </section>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>用户 / AI / 数据三层摘要</h3>
            <span className="status-pill is-slate">后台一页解释</span>
          </div>
          <div className="source-card-grid">
            {(data?.data_story || []).map((item) => (
              <article key={item.label} className="source-card">
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
                <p><strong>{item.value}</strong></p>
              </article>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>最新工作流动态</h3>
            <span className="status-pill is-blue">后台任务时间线</span>
          </div>
          <div className="api-progress-list">
            {(data?.workflow_timeline || []).map((item) => (
              <div key={`${item.workflow_key}-${item.updated_at}`} className="api-progress-item">
                <div>
                  <strong>{item.workflow_key}</strong>
                  <p>{item.trigger_type} · {item.updated_at || '时间未知'}</p>
                </div>
                <span className={`status-pill ${item.status === 'SUCCEEDED' ? 'is-green' : item.status === 'FAILED' ? 'is-red' : 'is-slate'}`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </section>
  );
}

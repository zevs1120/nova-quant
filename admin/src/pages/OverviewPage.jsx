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
  const activeUserRatio = headline.total_users ? (Number(headline.active_users_7d || 0) / Number(headline.total_users || 1)) * 100 : 0;
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

  const topSymbols = (data?.top_symbols || []).slice(0, 5);

  return (
    <section className="page-grid overview-page">
      <section className="hero-board">
        <div className="hero-copy-card">
          <p className="admin-eyebrow">Overview</p>
          <h3>平台运行总览</h3>
          <p className="hero-summary">这里汇总当前用户规模、信号活跃度、Alpha 生命周期、AI 运行情况和最新工作流状态。</p>

          <div className="source-card-grid">
            {(data?.data_story || []).map((item) => (
              <article key={item.label} className="source-card">
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
                <p><strong>{item.value}</strong></p>
              </article>
            ))}
          </div>
        </div>

        <div className="hero-visual-card">
          <RingMeter
            value={activeUserRatio}
            label="近 7 天活跃率"
            note={`活跃用户 ${headline.active_users_7d || 0} / 总用户 ${headline.total_users || 0}`}
            accent="#ef8d56"
          />

          <div className="mini-note-grid">
            <article className="mini-note-card tone-soft">
              <p>用户层</p>
              <strong>{headline.total_users || 0} 个账户正在被这套系统服务</strong>
            </article>
            <article className="mini-note-card tone-dark">
              <p>策略层</p>
              <strong>{headline.active_signals || 0} 条在线信号，{headline.shadow_candidates || 0} 个 Shadow 候选</strong>
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
          <LifecycleStack rows={data?.alpha_lifecycle || []} />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>用户交易模式</h3>
            <span className="status-pill is-blue">用户分层</span>
          </div>
          <MixBars rows={data?.user_mix || []} />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>信号方向分布</h3>
            <span className="status-pill is-amber">Signal mix</span>
          </div>
          <MixBars rows={data?.signal_direction_mix || []} />
        </article>
      </section>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>当前最活跃标的</h3>
            <span className="status-pill is-slate">信号热度</span>
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

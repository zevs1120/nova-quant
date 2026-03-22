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
            <span className="mix-bar-fill" style={{ width: `${(Number(item.value || 0) / total) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
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
  const workflowSummary = data?.workflow_summary || {};
  const aiSummary = data?.ai_summary || {};
  const dataSummary = data?.data_summary || {};
  const throughputControls = data?.throughput_controls || {};
  const throughputRecent = data?.throughput_recent || {};
  const diagnostics = data?.diagnostics || [];

  const stats = [
    {
      label: '模型运行模式',
      value: `${runtime.provider || 'unknown'} / ${runtime.mode || 'unknown'}`,
      detail: '说明管理后台当前看到的推理供应商和运行模式。',
      tone: 'blue'
    },
    {
      label: '后台工作流',
      value: `${workflowSummary.total || 0} 次`,
      detail: '最近 free_data、training、alpha discovery、shadow runner 等任务汇总。',
      tone: 'green'
    },
    {
      label: '新闻与因子',
      value: `${dataSummary.news_items_72h || 0} / ${dataSummary.news_factor_count || 0}`,
      detail: `前者是 72 小时新闻量，后者是已结构化的新闻因子量，覆盖率 ${dataSummary.news_factor_coverage_pct || 0}%。`,
      tone: 'amber'
    },
    {
      label: 'AI 调用',
      value: `${aiSummary.total || 0} 次`,
      detail: '最近 Nova / Marvix AI 任务运行统计。',
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
            <h3>工作流状态分布</h3>
            <span className="status-pill is-green">Workflow status</span>
          </div>
          <MixBars rows={workflowSummary.by_status || []} />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>工作流类型分布</h3>
            <span className="status-pill is-blue">Workflow mix</span>
          </div>
          <MixBars rows={workflowSummary.by_workflow || []} />
        </article>
      </section>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>研究吞吐控制面板</h3>
            <span className="status-pill is-blue">Throughput controls</span>
          </div>
          <div className="source-card-grid">
            <article className="source-card">
              <strong>服务容量目标</strong>
              <p>目标客户 {throughputControls.service_envelope?.target_active_clients || 0} 人，目标标的 {throughputControls.service_envelope?.target_daily_symbols || 0} 个，行动卡 {throughputControls.service_envelope?.action_cards?.conservative || 0}/{throughputControls.service_envelope?.action_cards?.balanced || 0}/{throughputControls.service_envelope?.action_cards?.aggressive || 0}。</p>
            </article>
            <article className="source-card">
              <strong>Alpha Discovery</strong>
              <p>间隔 {throughputControls.alpha_discovery?.interval_hours || 0} 小时，每轮 {throughputControls.alpha_discovery?.max_candidates_per_cycle || 0} 个候选，搜索预算 {throughputControls.alpha_discovery?.search_budget || 0}。</p>
            </article>
            <article className="source-card">
              <strong>Family 配额</strong>
              <p>{Object.entries(throughputControls.alpha_discovery?.family_coverage_targets || {}).map(([family, value]) => `${family}:${value}`).join(' / ') || '未配置'}</p>
            </article>
            <article className="source-card">
              <strong>新闻刷新</strong>
              <p>TTL {throughputControls.news_pipeline?.ttl_minutes || 0} 分钟，并发 {throughputControls.news_pipeline?.refresh_concurrency || 0}，扩展阈值 {throughputControls.news_pipeline?.min_rows_for_expansion || 0} 条。</p>
            </article>
            <article className="source-card">
              <strong>Gemini 因子化</strong>
              <p>并发 {throughputControls.news_pipeline?.gemini_factor_concurrency || 0}，最小间隔 {throughputControls.news_pipeline?.gemini_request_gap_ms || 0}ms。</p>
            </article>
            <article className="source-card">
              <strong>Heuristic 回退</strong>
              <p>{throughputControls.news_pipeline?.heuristic_factor_fallback ? '已开启，Gemini 失败时仍结构化新闻因子。' : '已关闭，仅依赖 Gemini。'}</p>
            </article>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>最近一轮产出</h3>
            <span className="status-pill is-green">Pipeline output</span>
          </div>
          <div className="source-card-grid">
            <article className="source-card">
              <strong>Free data</strong>
              <p>新闻刷新 {throughputRecent.latest_free_data?.refreshed_symbols ?? 0} 个标的，新闻写入 {throughputRecent.latest_free_data?.rows_upserted ?? 0} 条。</p>
            </article>
            <article className="source-card">
              <strong>Alpha discovery</strong>
              <p>接受 {throughputRecent.latest_alpha_discovery?.accepted ?? 0} 个，拒绝 {throughputRecent.latest_alpha_discovery?.rejected ?? 0} 个。</p>
            </article>
            <article className="source-card">
              <strong>Shadow runner</strong>
              <p>处理 {throughputRecent.latest_shadow_monitoring?.candidates_processed ?? 0} 个，晋升 Canary {throughputRecent.latest_shadow_monitoring?.promoted_to_canary ?? 0} 个。</p>
            </article>
          </div>
        </article>
      </section>

      <section className="page-grid">
        <article className="panel">
          <div className="panel-header">
            <h3>诊断结论</h3>
            <span className="status-pill is-amber">Diagnostics</span>
          </div>
          <div className="health-route-list">
            {diagnostics.map((row) => (
              <div key={row.title} className="health-route-item">
                <div>
                  <strong>{row.title}</strong>
                  <p>{row.detail}</p>
                </div>
                <span className={`status-pill ${row.severity === 'WARN' ? 'is-red' : 'is-blue'}`}>{row.severity}</span>
              </div>
            ))}
            {!diagnostics.length ? <p className="panel-copy">当前没有明显瓶颈告警。</p> : null}
          </div>
        </article>
      </section>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>新闻源覆盖</h3>
            <span className="status-pill is-amber">Source mix</span>
          </div>
          <MixBars rows={dataSummary.source_mix || []} />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>因子标签覆盖</h3>
            <span className="status-pill is-slate">Factor tags</span>
          </div>
          <MixBars rows={dataSummary.factor_tag_mix || []} />
        </article>
      </section>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>模型路由与别名</h3>
            <span className="status-pill is-blue">Runtime routes</span>
          </div>
          <div className="health-route-list">
            {(runtime.routes || []).map((row) => (
              <div key={`${row.task}-${row.alias}`} className="health-route-item">
                <div>
                  <strong>{row.task}</strong>
                  <p>{row.reason}</p>
                </div>
                <div className="candidate-timeline-meta">
                  <span className="status-pill is-slate">{row.alias}</span>
                  <span>{row.provider}/{row.model}</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>参考数据快照</h3>
            <span className="status-pill is-green">Data freshness</span>
          </div>
          <div className="source-card-grid">
            <article className="source-card">
              <strong>基本面快照</strong>
              <p>当前展示 {dataSummary.fundamentals_count || 0} 条最近记录。</p>
            </article>
            <article className="source-card">
              <strong>期权快照</strong>
              <p>当前展示 {dataSummary.option_chain_count || 0} 条最近记录。</p>
            </article>
            <article className="source-card">
              <strong>新闻因子</strong>
              <p>当前沉淀 {dataSummary.news_factor_count || 0} 条可供策略层使用的结构化因子。</p>
            </article>
          </div>
        </article>
      </section>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>最近新闻因子</h3>
            <span className="status-pill is-amber">Factor feed</span>
          </div>
          <div className="news-factor-list">
            {(data?.recent_news_factors || []).map((row) => (
              <article key={row.id} className="news-factor-card">
                <strong>{row.symbol} · {row.source}</strong>
                <p>{row.factor_summary || row.headline}</p>
                <div className="news-factor-tags">
                  {(row.factor_tags || []).slice(0, 6).map((tag) => (
                    <span key={tag} className="tag-chip">{tag}</span>
                  ))}
                  {!row.factor_tags?.length ? <span className="tag-chip">无标签</span> : null}
                </div>
              </article>
            ))}
            {!data?.recent_news_factors?.length ? <p className="panel-copy">当前没有结构化新闻因子。</p> : null}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>最近 AI 任务</h3>
            <span className="status-pill is-blue">AI task tape</span>
          </div>
          <div className="candidate-timeline">
            {(data?.recent_nova_runs || []).map((row) => (
              <div key={row.id} className="candidate-timeline-item">
                <div>
                  <strong>{row.task_type}</strong>
                  <p>{row.route_alias || 'unrouted'} · {row.model_name || 'model-unknown'}</p>
                </div>
                <div className="candidate-timeline-meta">
                  <span className={`status-pill ${row.status === 'SUCCEEDED' ? 'is-green' : row.status === 'FAILED' ? 'is-red' : 'is-slate'}`}>
                    {row.status}
                  </span>
                  <span>{row.created_at}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </section>
  );
}

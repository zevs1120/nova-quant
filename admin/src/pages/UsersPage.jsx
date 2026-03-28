import StatCard from '../components/StatCard';
import useAdminResource from '../hooks/useAdminResource';
import { getAdminUsers } from '../services/adminApi';

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
      {!rows.length ? <p className="panel-copy">当前没有可展示的数据分层。</p> : null}
    </div>
  );
}

export default function UsersPage() {
  const { data, loading, error } = useAdminResource(getAdminUsers, []);

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h3>正在加载用户数据</h3>
          <span className="status-pill is-slate">稍候</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h3>用户数据加载失败</h3>
          <span className="status-pill is-red">异常</span>
        </div>
        <p className="panel-copy">{error}</p>
      </section>
    );
  }

  const summary = data?.summary || {};
  const highlightUsers = [...(data?.users || [])]
    .sort((left, right) => {
      const sessionGap =
        Number(right.active_session_count || 0) - Number(left.active_session_count || 0);
      if (sessionGap !== 0) return sessionGap;
      return Number(right.execution_count || 0) - Number(left.execution_count || 0);
    })
    .slice(0, 8);

  const stats = [
    {
      label: '注册用户总量',
      value: `${summary.total_users || 0} 个`,
      detail: '当前后台识别到的全部账户规模。',
      tone: 'blue',
    },
    {
      label: '近 7 天活跃',
      value: `${summary.active_last_7d || 0} 个`,
      detail: '这是判断产品是否真的被持续使用的核心指标。',
      tone: 'green',
    },
    {
      label: '管理员账号',
      value: `${summary.admin_count || 0} 个`,
      detail: '只保留具备后台权限的真实运营角色。',
      tone: 'amber',
    },
    {
      label: '通知触达',
      value: `${summary.total_notifications || 0} 次`,
      detail: '用于观察陪伴式运营是否还在持续发生。',
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
            <h3>用户分层总览</h3>
            <span className="status-pill is-blue">Mode / Risk</span>
          </div>
          <div className="panel-split-grid">
            <div className="panel-subsection">
              <p className="panel-subsection-title">交易模式</p>
              <MixBars rows={data?.trade_mode_mix || []} />
            </div>
            <div className="panel-subsection">
              <p className="panel-subsection-title">风险档案</p>
              <MixBars rows={data?.risk_profile_mix || []} />
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>增长与活跃</h3>
            <span className="status-pill is-green">Signup / Activity</span>
          </div>
          <div className="panel-split-grid">
            <div className="panel-subsection">
              <p className="panel-subsection-title">最近 8 周注册</p>
              <div className="mini-column-chart compact-chart">
                {(data?.signup_trend || []).map((item) => (
                  <div key={item.label} className="mini-column-item">
                    <span className="mini-column-value">{item.value}</span>
                    <div className="mini-column-track">
                      <span
                        className="mini-column-fill"
                        style={{ height: `${Math.max(10, Number(item.value || 0) * 18)}px` }}
                      />
                    </div>
                    <span className="mini-column-label">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel-subsection">
              <p className="panel-subsection-title">当前活跃状态</p>
              <MixBars rows={data?.status_mix || []} />
            </div>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>重点账户样本</h3>
          <span className="status-pill is-slate">Highest activity</span>
        </div>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>账户</th>
                <th>模式 / 风险</th>
                <th>最近登录</th>
                <th>决策 / 执行</th>
                <th>会话 / 持仓</th>
              </tr>
            </thead>
            <tbody>
              {highlightUsers.map((row) => (
                <tr key={row.user_id}>
                  <td>
                    <strong>{row.email}</strong>
                    <div className="table-subline">{row.roles?.join(', ') || 'USER'}</div>
                  </td>
                  <td>
                    {row.trade_mode || '--'}
                    <div className="table-subline">{row.risk_profile_key || '--'}</div>
                  </td>
                  <td>{row.last_login_at || '未登录'}</td>
                  <td>
                    决策 {row.decision_count || 0} / 执行 {row.execution_count || 0}
                    <div className="table-subline">
                      Paper {row.paper_execution_count || 0} · Live {row.live_execution_count || 0}
                    </div>
                  </td>
                  <td>
                    {row.active_session_count || 0} 个活跃会话
                    <div className="table-subline">
                      观察列表 {row.watchlist_count || 0} · 持仓 {row.holding_count || 0}
                    </div>
                  </td>
                </tr>
              ))}
              {!highlightUsers.length ? (
                <tr>
                  <td colSpan="5">当前没有可展示的重点账户样本。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

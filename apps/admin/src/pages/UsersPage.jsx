import StatCard from '../components/StatCard';
import useAdminResource from '../hooks/useAdminResource';
import { getAdminUsers } from '../services/adminApi';

const columns = ['邮箱', '角色', '交易模式', '风险档案', '最近登录', '活跃度'];

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
  const stats = [
    { label: '注册用户总量', value: `${summary.total_users || 0} 个`, detail: '后台当前可识别的全部账户。', tone: 'blue' },
    { label: '近 7 天活跃', value: `${summary.active_last_7d || 0} 个`, detail: '说明用户是否真的开始使用产品。', tone: 'green' },
    { label: '管理员账号', value: `${summary.admin_count || 0} 个`, detail: '当前具备后台权限的账户数量。', tone: 'amber' },
    { label: '通知触达', value: `${summary.total_notifications || 0} 次`, detail: '说明系统是否在持续触达和陪伴用户。', tone: 'red' }
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
            <h3>交易模式分布</h3>
            <span className="status-pill is-blue">用户分层</span>
          </div>
          <MixBars rows={data?.trade_mode_mix || []} />
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>风险档案分布</h3>
            <span className="status-pill is-amber">风险画像</span>
          </div>
          <MixBars rows={data?.risk_profile_mix || []} />
        </article>
      </section>

      <section className="page-grid two-up">
        <article className="panel">
          <div className="panel-header">
            <h3>最近 8 周注册趋势</h3>
            <span className="status-pill is-green">增长观察</span>
          </div>
          <div className="mini-column-chart">
            {(data?.signup_trend || []).map((item) => (
              <div key={item.label} className="mini-column-item">
                <span className="mini-column-value">{item.value}</span>
                <div className="mini-column-track">
                  <span className="mini-column-fill" style={{ height: `${Math.max(10, Number(item.value || 0) * 18)}px` }} />
                </div>
                <span className="mini-column-label">{item.label}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h3>用户活跃状态</h3>
            <span className="status-pill is-slate">运营视图</span>
          </div>
          <MixBars rows={data?.status_mix || []} />
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>用户列表</h3>
          <span className="status-pill is-blue">前端用户真实数据</span>
        </div>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
                <th>决策/执行</th>
                <th>会话</th>
              </tr>
            </thead>
            <tbody>
              {(data?.users || []).map((row) => (
                <tr key={row.user_id}>
                  <td>
                    <strong>{row.email}</strong>
                    <div className="table-subline">{row.name}</div>
                  </td>
                  <td>{row.roles?.join(', ') || 'USER'}</td>
                  <td>{row.trade_mode}</td>
                  <td>{row.risk_profile_key}</td>
                  <td>{row.last_login_at || '未登录'}</td>
                  <td>{row.status}</td>
                  <td>
                    决策 {row.decision_count} / 执行 {row.execution_count}
                    <div className="table-subline">Paper {row.paper_execution_count} · Live {row.live_execution_count}</div>
                  </td>
                  <td>
                    {row.active_session_count} 个活跃会话
                    <div className="table-subline">观察列表 {row.watchlist_count} · 持仓 {row.holding_count}</div>
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

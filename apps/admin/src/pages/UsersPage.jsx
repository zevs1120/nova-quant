const columns = ['邮箱', '套餐', '交易模式', '风险档案', '最近登录', '状态'];

const rows = [
  ['zevs1120@gmail.com', '创始人', 'deep', 'balanced', '等待 API', '管理员种子账号'],
  ['user@example.com', 'Starter', 'starter', 'balanced', '等待 API', '示例数据']
];

export default function UsersPage() {
  return (
    <section className="page-grid">
      <section className="panel">
        <div className="panel-header">
          <h3>用户管理</h3>
          <span className="status-pill is-slate">待接真实数据</span>
        </div>
        <p className="panel-copy">
          这里将展示注册用户、账户状态、套餐状态、风险档案以及运营支持操作。
        </p>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.join(':')}>
                  {row.map((cell) => (
                    <td key={cell}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

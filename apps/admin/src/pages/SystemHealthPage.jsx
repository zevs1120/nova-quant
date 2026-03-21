const healthRows = [
  ['行情数据', 'K 线、数据新鲜度、覆盖范围、过期计数'],
  ['新闻链路', '抓取成功率、因子化状态、供应商回退'],
  ['基本面', 'Alpha Vantage + Finnhub 刷新状态'],
  ['期权', 'CBOE / Yahoo 快照可用性'],
  ['模型', 'Marvix worker、Gemini 健康、当前运行模式'],
  ['任务', 'free_data、training flywheel、alpha discovery、shadow monitoring']
];

export default function SystemHealthPage() {
  return (
    <section className="page-grid">
      <section className="panel">
        <div className="panel-header">
          <h3>系统健康</h3>
          <span className="status-pill is-slate">已映射私有运维</span>
        </div>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>领域</th>
                <th>目标可见性</th>
              </tr>
            </thead>
            <tbody>
              {healthRows.map(([area, description]) => (
                <tr key={area}>
                  <td>{area}</td>
                  <td>{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

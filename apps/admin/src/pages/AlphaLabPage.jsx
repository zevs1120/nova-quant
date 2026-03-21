const lifecycleRows = [
  ['DRAFT', '尚未审核的自动候选'],
  ['BACKTEST_PASS', '通过发现评估闸门的候选'],
  ['SHADOW', '只做实时跟踪，不部署真实资金'],
  ['CANARY', '有限影响线上结果，仍受治理控制'],
  ['PROD', '仅在显式闸门下才可正式上线'],
  ['RETIRED', '已衰减或不再符合风险要求'],
  ['REJECTED', '未通过稳健性或相关性检查']
];

export default function AlphaLabPage() {
  return (
    <section className="page-grid two-up">
      <section className="panel">
        <div className="panel-header">
          <h3>生命周期</h3>
          <span className="status-pill is-green">已对齐后台</span>
        </div>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>状态</th>
                <th>含义</th>
              </tr>
            </thead>
            <tbody>
              {lifecycleRows.map(([state, description]) => (
                <tr key={state}>
                  <td>{state}</td>
                  <td>{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>这里应该展示什么</h3>
          <span className="status-pill is-amber">等待 API</span>
        </div>
        <ul className="bullet-list">
          <li>接受与拒绝原因。</li>
          <li>回测代理指标与稳健性检查。</li>
          <li>Shadow 表现以及相对回测的退化情况。</li>
          <li>与当前活跃 Alpha 库的相关性。</li>
          <li>晋升与退役时间线。</li>
        </ul>
      </section>
    </section>
  );
}

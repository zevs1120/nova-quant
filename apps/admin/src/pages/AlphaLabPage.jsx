const lifecycleRows = [
  ['DRAFT', 'Unreviewed generated candidates'],
  ['BACKTEST_PASS', 'Accepted by discovery evaluation gates'],
  ['SHADOW', 'Live-tracked without capital deployment'],
  ['CANARY', 'Limited runtime influence, still governed'],
  ['PROD', 'Explicitly promoted only behind gate'],
  ['RETIRED', 'Decayed or risk-incompatible'],
  ['REJECTED', 'Failed robustness or correlation checks']
];

export default function AlphaLabPage() {
  return (
    <section className="page-grid two-up">
      <section className="panel">
        <div className="panel-header">
          <h3>Lifecycle</h3>
          <span className="status-pill is-green">Aligned to backend</span>
        </div>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>State</th>
                <th>Meaning</th>
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
          <h3>What belongs here</h3>
          <span className="status-pill is-amber">API pending</span>
        </div>
        <ul className="bullet-list">
          <li>Acceptance and rejection reasons.</li>
          <li>Backtest proxy metrics and robustness checks.</li>
          <li>Shadow performance and degradation vs backtest.</li>
          <li>Correlation to active alpha inventory.</li>
          <li>Promotion and retirement timeline.</li>
        </ul>
      </section>
    </section>
  );
}

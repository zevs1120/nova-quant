const healthRows = [
  ['Market data', 'Bars, freshness, coverage, stale counts'],
  ['News pipeline', 'Fetch success, factorization, provider fallbacks'],
  ['Fundamentals', 'Alpha Vantage + Finnhub refresh state'],
  ['Options', 'CBOE/Yahoo snapshot availability'],
  ['Models', 'Marvix worker, Gemini health, local runtime mode'],
  ['Jobs', 'free_data, training flywheel, alpha discovery, shadow monitoring']
];

export default function SystemHealthPage() {
  return (
    <section className="page-grid">
      <section className="panel">
        <div className="panel-header">
          <h3>System Health</h3>
          <span className="status-pill is-slate">Private ops mapped</span>
        </div>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Area</th>
                <th>Target visibility</th>
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

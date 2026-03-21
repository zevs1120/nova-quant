const columns = ['Email', 'Plan', 'Trade Mode', 'Risk Profile', 'Last Login', 'Status'];

const rows = [
  ['zevs1120@gmail.com', 'Founder', 'deep', 'balanced', 'pending API', 'Admin seed'],
  ['user@example.com', 'Starter', 'starter', 'balanced', 'pending API', 'Example row']
];

export default function UsersPage() {
  return (
    <section className="page-grid">
      <section className="panel">
        <div className="panel-header">
          <h3>Users</h3>
          <span className="status-pill is-slate">Planned data source</span>
        </div>
        <p className="panel-copy">
          This page should expose registered users, account state, plan status, risk profile, and support actions.
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

import StatCard from '../components/StatCard';

const stats = [
  {
    label: 'Primary Surface',
    value: 'admin.novaquant.cloud',
    detail: 'Separate deploy target from the user-facing app.',
    tone: 'blue'
  },
  {
    label: 'Backend Compute',
    value: 'EC2 + Marvix',
    detail: 'Workers, discovery loop, data jobs, and private ops stay off the admin frontend.',
    tone: 'green'
  },
  {
    label: 'Promotion Guard',
    value: 'SHADOW → CANARY',
    detail: 'No autonomous direct production promotion.',
    tone: 'amber'
  },
  {
    label: 'Admin Auth',
    value: 'Required',
    detail: 'Separate admin session and role gate still needs wiring.',
    tone: 'red'
  }
];

export default function OverviewPage() {
  return (
    <section className="page-grid">
      <div className="stats-grid">
        {stats.map((item) => (
          <StatCard key={item.label} {...item} />
        ))}
      </div>

      <section className="panel">
        <div className="panel-header">
          <h3>Initial Admin Surface</h3>
          <span className="status-pill is-blue">Phase 1</span>
        </div>
        <ul className="bullet-list">
          <li>User-facing app and admin panel stay on separate subdomains.</li>
          <li>Admin panel reads admin-only APIs, not loopback-only EC2 routes.</li>
          <li>Alpha lifecycle and shadow metrics belong in admin, not in public product UI.</li>
          <li>EC2 remains the compute plane; Vercel remains the delivery plane.</li>
        </ul>
      </section>
    </section>
  );
}

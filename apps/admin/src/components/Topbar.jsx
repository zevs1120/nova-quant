export default function Topbar({ title, subtitle }) {
  return (
    <header className="admin-topbar">
      <div>
        <p className="admin-eyebrow">admin.novaquant.cloud</p>
        <h2>{title}</h2>
        <p className="admin-muted">{subtitle}</p>
      </div>
      <div className="admin-topbar-status">
        <span className="status-pill is-amber">Scaffold</span>
        <span className="status-pill is-slate">Admin APIs pending</span>
      </div>
    </header>
  );
}

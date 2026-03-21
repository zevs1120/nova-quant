export default function Topbar({ title, subtitle, session, onLogout }) {
  return (
    <header className="admin-topbar">
      <div>
        <p className="admin-eyebrow">admin.novaquant.cloud</p>
        <h2>{title}</h2>
        <p className="admin-muted">{subtitle}</p>
      </div>
      <div className="admin-topbar-status">
        {session?.user?.email ? <span className="status-pill is-slate">{session.user.email}</span> : null}
        <span className="status-pill is-amber">后台骨架</span>
        <button type="button" className="admin-ghost-btn" onClick={() => onLogout?.()}>
          退出登录
        </button>
      </div>
    </header>
  );
}

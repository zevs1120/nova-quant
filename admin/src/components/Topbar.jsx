export default function Topbar({ title, subtitle, session, onLogout }) {
  return (
    <header className="admin-topbar">
      <div className="admin-topbar-copy">
        <p className="admin-eyebrow">admin.novaquant.cloud</p>
        <h2>{title}</h2>
        <p className="admin-muted">{subtitle}</p>
      </div>
      <div className="admin-topbar-status">
        <span className="status-pill is-green">管理员会话有效</span>
        {session?.user?.email ? <span className="status-pill is-slate">{session.user.email}</span> : null}
        <button type="button" className="admin-ghost-btn" onClick={() => onLogout?.()}>
          退出登录
        </button>
      </div>
    </header>
  );
}

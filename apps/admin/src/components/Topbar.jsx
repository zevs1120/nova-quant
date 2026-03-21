export default function Topbar({ title, subtitle, session, onLogout }) {
  return (
    <header className="admin-topbar">
      <div className="admin-topbar-copy">
        <p className="admin-eyebrow">admin.novaquant.cloud</p>
        <h2>{title}</h2>
        <p className="admin-muted">{subtitle}</p>
      </div>
      <div className="admin-topbar-status">
        <span className="status-pill is-green">实盘自动直推已关闭</span>
        <span className="status-pill is-blue">适合对外演示</span>
        {session?.user?.email ? <span className="status-pill is-slate">{session.user.email}</span> : null}
        <span className="status-pill is-amber">图形化后台</span>
        <button type="button" className="admin-ghost-btn" onClick={() => onLogout?.()}>
          退出登录
        </button>
      </div>
    </header>
  );
}

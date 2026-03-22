export default function Sidebar({ items, activeId, onSelect }) {
  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-brand">
        <p className="admin-eyebrow">NovaQuant / MARVIX</p>
        <h1>管理后台</h1>
        <p className="admin-muted">用户、策略、AI、数据与执行的统一控制台。</p>
      </div>
      <nav className="admin-nav">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`admin-nav-item ${item.id === activeId ? 'is-active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="admin-nav-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="admin-nav-copy">
              <span className="admin-nav-label">{item.label}</span>
              <span className="admin-nav-description">{item.description}</span>
            </span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

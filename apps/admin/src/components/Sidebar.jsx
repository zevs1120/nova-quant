export default function Sidebar({ items, activeId, onSelect }) {
  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-brand">
        <p className="admin-eyebrow">NovaQuant</p>
        <h1>Admin Panel</h1>
        <p className="admin-muted">Separate control surface for ops, alpha governance, and users.</p>
      </div>
      <nav className="admin-nav">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`admin-nav-item ${item.id === activeId ? 'is-active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="admin-nav-label">{item.label}</span>
            <span className="admin-nav-description">{item.description}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

export default function Sidebar({ items, activeId, onSelect }) {
  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-brand">
        <p className="admin-eyebrow">NovaQuant / MARVIX</p>
        <h1>管理后台</h1>
        <p className="admin-muted">给运营、投资人沟通和 Alpha 治理看的统一驾驶舱。</p>
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

      <section className="admin-sidebar-note">
        <p className="admin-sidebar-note-title">投资人一眼看懂</p>
        <ul className="admin-sidebar-note-list">
          <li>先发现，再回测，再影子运行。</li>
          <li>不让新策略直接动正式资金。</li>
          <li>后台、前台、算力三层分离。</li>
        </ul>
      </section>
    </aside>
  );
}

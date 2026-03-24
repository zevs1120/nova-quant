export default function QuickAccessSheet({
  open,
  onClose,
  options = [],
  onSelect,
  onOpenAi,
  onOpenAbout,
}) {
  if (!open) return null;

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <article
        className="sheet-card quick-access-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="card-header">
          <div>
            <h3 className="card-title">More Pages</h3>
            <p className="muted">Keep bottom tabs simple. Open deeper pages only when needed.</p>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="quick-access-list">
          {options.map((item) => (
            <button
              type="button"
              key={item.key}
              className="quick-access-row"
              onClick={() => onSelect?.(item.key)}
            >
              <span className="quick-access-title">{item.title}</span>
              <span className="quick-access-desc">{item.description}</span>
            </button>
          ))}
        </div>

        <div className="action-row">
          <button type="button" className="secondary-btn" onClick={onOpenAi}>
            AI Assistant
          </button>
          <button type="button" className="secondary-btn" onClick={onOpenAbout}>
            About & Compliance
          </button>
        </div>
      </article>
    </div>
  );
}

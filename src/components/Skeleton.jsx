export default function Skeleton({
  lines = 3,
  compact = false,
  className = '',
  variant = 'lines',
}) {
  const widths = [100, 92, 84, 78, 96, 70];
  if (variant === 'screen') {
    return (
      <div className={`skeleton-card skeleton-screen ${className}`.trim()} aria-hidden="true">
        <div className="skeleton-block skeleton-screen-hero" />
        <div className="skeleton-screen-grid">
          <div className="skeleton-block skeleton-screen-card" />
          <div className="skeleton-block skeleton-screen-card" />
        </div>
        <div className="skeleton-block skeleton-screen-band" />
        <div className="skeleton-block skeleton-screen-list" />
        <div className="skeleton-block skeleton-screen-list" />
      </div>
    );
  }

  return (
    <div
      className={`skeleton-card ${compact ? 'compact' : ''} ${className}`.trim()}
      aria-hidden="true"
    >
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="skeleton-line"
          style={{
            width: `${widths[index % widths.length]}%`,
          }}
        />
      ))}
    </div>
  );
}

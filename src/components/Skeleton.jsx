export default function Skeleton({ lines = 3, compact = false, className = '' }) {
  const widths = [100, 92, 84, 78, 96, 70];
  return (
    <div className={`skeleton-card ${compact ? 'compact' : ''} ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="skeleton-line"
          style={{
            width: `${widths[index % widths.length]}%`
          }}
        />
      ))}
    </div>
  );
}

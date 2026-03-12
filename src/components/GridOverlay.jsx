export default function GridOverlay({ className = '' }) {
  return <div className={`grid-overlay ${className}`.trim()} aria-hidden="true" />;
}

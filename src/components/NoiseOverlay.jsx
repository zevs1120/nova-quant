export default function NoiseOverlay({ className = '' }) {
  return <div className={`noise-overlay ${className}`.trim()} aria-hidden="true" />;
}

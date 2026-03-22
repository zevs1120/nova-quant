export default function StatCard({ label, value, detail, tone = 'neutral' }) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <p className="stat-label">{label}</p>
      <h3 className="stat-value">{value}</h3>
      <p className="stat-detail">{detail}</p>
    </article>
  );
}

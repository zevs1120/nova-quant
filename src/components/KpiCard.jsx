export default function KpiCard({ label, value, sub }) {
  return (
    <article className="kpi-card">
      <p className="kpi-label">{label}</p>
      <h3 className="kpi-value">{value}</h3>
      {sub ? <p className="kpi-sub">{sub}</p> : null}
    </article>
  );
}

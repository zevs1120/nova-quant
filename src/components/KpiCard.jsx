import { memo } from 'react';

function KpiCard({ label, value, sub, className = '' }) {
  return (
    <article className={`kpi-card ${className}`.trim()}>
      <p className="kpi-label">{label}</p>
      <h3 className="kpi-value">{value}</h3>
      {sub ? <p className="kpi-sub">{sub}</p> : null}
    </article>
  );
}

export default memo(KpiCard);

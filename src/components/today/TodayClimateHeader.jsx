export default function TodayClimateHeader({
  climateVisualTone,
  climateStatusLabel,
  todayDateLabel,
  climateHeadline,
  climateSubtitle,
  climateEyebrowLabel,
}) {
  return (
    <section className={`today-rebuild-header today-rebuild-tone-${climateVisualTone}`}>
      <div className="today-rebuild-climate">
        <p className="today-rebuild-caption">{todayDateLabel}</p>
        <div className="today-rebuild-heading">
          <div className="today-rebuild-title-copy">
            <p className="today-rebuild-kicker">{climateEyebrowLabel}</p>
            <h1 className="today-rebuild-title">{climateHeadline}</h1>
          </div>
          <span className={`today-rebuild-status today-rebuild-status-${climateVisualTone}`}>
            {climateStatusLabel}
          </span>
        </div>
        {climateSubtitle ? <p className="today-rebuild-subtitle">{climateSubtitle}</p> : null}
      </div>
    </section>
  );
}

export default function TodayClimateHeader({
  climateVisualTone,
  climateStatusLabel,
  todayDateLabel,
}) {
  return (
    <section className={`today-rebuild-header today-rebuild-tone-${climateVisualTone}`}>
      <div className="today-rebuild-climate">
        <p className="today-rebuild-caption">{todayDateLabel}</p>
        <div className="today-rebuild-title-row">
          <h1 className="today-rebuild-title">Climate</h1>
          <span
            className={`today-rebuild-dot today-rebuild-dot-${climateVisualTone}`}
            aria-label={climateStatusLabel}
          />
        </div>
      </div>
    </section>
  );
}

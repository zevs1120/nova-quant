import {
  portalBacktestMetrics,
  portalBenchmarkComparison,
  portalCurveBars,
  portalFabricLanes,
  portalFlywheelSteps,
  portalHeroStats,
  portalHeatmapMonths,
  portalMonthlyHeatmap,
  portalMonteCarloPaths,
  portalMonteCarloStats,
} from '../data/index.js';
import { useViewportReveal } from '../hooks/useViewportMotion.js';

const PORTAL_MONTE_CARLO_WIDTH = 320;
const PORTAL_MONTE_CARLO_HEIGHT = 188;

const portalMonteCarloRange = portalMonteCarloPaths.reduce(
  (range, path) => ({
    min: Math.min(range.min, ...path.values),
    max: Math.max(range.max, ...path.values),
  }),
  { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
);

function getHeatmapTone(value) {
  if (value == null) return 'empty';
  if (value >= 4.5) return 'strong-positive';
  if (value > 0) return 'positive';
  if (value <= -2) return 'strong-negative';
  return 'negative';
}

function buildMonteCarloPath(values) {
  const domain = Math.max(1, portalMonteCarloRange.max - portalMonteCarloRange.min);

  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * PORTAL_MONTE_CARLO_WIDTH;
      const y =
        PORTAL_MONTE_CARLO_HEIGHT -
        ((value - portalMonteCarloRange.min) / domain) * PORTAL_MONTE_CARLO_HEIGHT;

      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function PortalHero() {
  const { ref, isVisible } = useViewportReveal({ threshold: 0.14 });
  const heroPrinciples = ['Replayable', 'Benchmark-aware', 'Promotion-gated'];

  return (
    <section
      ref={ref}
      className={`spread portal-hero-spread${isVisible ? ' is-motion-visible' : ''}`}
      id="portal-top"
    >
      <div className="portal-hero-atmosphere" aria-hidden="true">
        <span className="portal-hero-block portal-hero-block-pink" />
        <span className="portal-hero-block portal-hero-block-blue" />
        <span className="portal-hero-block portal-hero-block-mint" />
        <span className="portal-hero-block portal-hero-block-ink" />
      </div>

      <div className="campaign-grid portal-hero-grid">
        <div className="portal-hero-copy">
          <p className="section-kicker">Data Portal</p>
          <h1>
            <span>Where research</span>
            <span>becomes evidence.</span>
          </h1>
          <p className="micro-intro">
            Data Portal is the operating layer behind the product: a single place to inspect what
            came in, what got replayed, what passed the gate, and what shipped with receipts.
          </p>

          <div className="portal-hero-principles" aria-label="Data portal principles">
            {heroPrinciples.map((item) => (
              <span className="portal-hero-principle" key={item}>
                {item}
              </span>
            ))}
          </div>

          <div className="portal-hero-stats" aria-label="Data portal summary metrics">
            {portalHeroStats.map((item) => (
              <article className="portal-mini-stat" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PortalBacktestSection() {
  const { ref, isVisible } = useViewportReveal();

  return (
    <section
      ref={ref}
      className={`spread portal-backtest-spread${isVisible ? ' is-motion-visible' : ''}`}
      id="backtest"
    >
      <div className="campaign-grid portal-backtest-grid">
        <div className="portal-section-copy">
          <p className="section-kicker">Backtest</p>
          <h2>Nothing graduates into product without surviving replay.</h2>
          <p className="micro-intro">
            We do not want a model that looks smart once. We want a system that holds up across
            windows, regime shifts, promotion gates, and actual execution context.
          </p>
        </div>

        <div className="portal-backtest-stage">
          <article className="portal-backtest-shell">
            <div className="portal-backtest-head">
              <span className="portal-shell-kicker">BETA BREAKOUT / 2014 → 2026</span>
              <span className="portal-shell-pill">WALK-FORWARD</span>
            </div>

            <div className="portal-backtest-chart">
              {portalCurveBars.map((value, index) => (
                <span
                  key={`backtest-${value}-${index}`}
                  style={{ '--portal-line-height': `${Math.max(18, value)}%` }}
                />
              ))}
            </div>

            <div className="portal-backtest-axis">
              <span>2014</span>
              <span>2018</span>
              <span>2022</span>
              <span>2026</span>
            </div>

            <div className="portal-backtest-notes">
              <span>Drawdown capped</span>
              <span>Replay saved</span>
              <span>Stress pack passed</span>
            </div>
          </article>

          <div className="portal-backtest-metric-grid">
            {portalBacktestMetrics.map((item) => (
              <article
                className={`portal-metric-card portal-metric-card-${item.tone}`}
                key={item.label}
              >
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PortalAnalyticsSection() {
  const { ref, isVisible } = useViewportReveal();
  const strategyReturn = Number.parseFloat(portalBenchmarkComparison[0]?.value ?? '0');
  const sp500Return = Number.parseFloat(portalBenchmarkComparison[1]?.value ?? '0');
  const alphaVsSp500 = Math.round(strategyReturn - sp500Return);

  return (
    <section
      ref={ref}
      className={`spread portal-analytics-spread${isVisible ? ' is-motion-visible' : ''}`}
      id="analytics"
    >
      <div className="campaign-grid portal-analytics-grid">
        <div className="portal-section-copy">
          <p className="section-kicker">Analytics Layer</p>
          <h2>See the path, not just the headline number.</h2>
          <p className="micro-intro">
            The portal should show where return came from, how future paths distribute, and how the
            strategy compares against broad market baselines like the S&amp;P 500 and Nasdaq.
          </p>
        </div>

        <div className="portal-analytics-stage">
          <article className="portal-analytics-card portal-heatmap-card">
            <div className="portal-card-head">
              <span className="portal-shell-kicker">MONTHLY RETURN HEATMAP</span>
              <span className="portal-shell-pill">REGIME MEMORY</span>
            </div>

            <div className="portal-heatmap-scroll">
              <div
                className="portal-heatmap-shell"
                role="table"
                aria-label="Monthly return heatmap"
              >
                <div className="portal-heatmap-row portal-heatmap-row-head" role="row">
                  <span className="portal-heatmap-year" role="columnheader">
                    Year
                  </span>
                  {portalHeatmapMonths.map((month) => (
                    <span className="portal-heatmap-month" key={month} role="columnheader">
                      {month}
                    </span>
                  ))}
                </div>

                {portalMonthlyHeatmap.map((row) => (
                  <div className="portal-heatmap-row" key={row.year} role="row">
                    <span className="portal-heatmap-year" role="rowheader">
                      {row.year}
                    </span>

                    {row.values.map((value, index) => (
                      <span
                        className={`portal-heatmap-cell portal-heatmap-cell-${getHeatmapTone(value)}`}
                        key={`${row.year}-${portalHeatmapMonths[index]}`}
                        role="cell"
                        aria-label={
                          value == null
                            ? `${row.year} ${portalHeatmapMonths[index]} no data`
                            : `${row.year} ${portalHeatmapMonths[index]} ${value.toFixed(1)} percent`
                        }
                      >
                        {value == null ? '' : `${value > 0 ? '+' : ''}${value.toFixed(1)}`}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="portal-heatmap-legend" aria-hidden="true">
              <span>Weak</span>
              <span className="portal-heatmap-swatch portal-heatmap-swatch-negative" />
              <span className="portal-heatmap-swatch portal-heatmap-swatch-neutral" />
              <span className="portal-heatmap-swatch portal-heatmap-swatch-positive" />
              <span>Strong</span>
            </div>
          </article>

          <article className="portal-analytics-card portal-monte-carlo-card">
            <div className="portal-card-head">
              <span className="portal-shell-kicker">MONTE CARLO SIMULATION</span>
              <span className="portal-shell-pill">10K PATHS</span>
            </div>

            <div className="portal-monte-carlo-chart">
              <svg
                aria-label="Monte Carlo simulation path fan"
                className="portal-monte-carlo-svg"
                role="img"
                viewBox={`0 0 ${PORTAL_MONTE_CARLO_WIDTH} ${PORTAL_MONTE_CARLO_HEIGHT}`}
              >
                <path
                  className="portal-monte-carlo-baseline"
                  d={`M0 ${PORTAL_MONTE_CARLO_HEIGHT - 1} H${PORTAL_MONTE_CARLO_WIDTH}`}
                />

                {portalMonteCarloPaths.map((path) => (
                  <polyline
                    className={`portal-monte-carlo-path portal-monte-carlo-path-${path.tone}`}
                    fill="none"
                    key={path.label}
                    points={buildMonteCarloPath(path.values)}
                  />
                ))}
              </svg>
            </div>

            <div className="portal-monte-carlo-axis" aria-hidden="true">
              <span>Start</span>
              <span>3M</span>
              <span>6M</span>
              <span>9M</span>
              <span>12M</span>
            </div>

            <div className="portal-monte-carlo-stat-grid">
              {portalMonteCarloStats.map((item) => (
                <article
                  className={`portal-monte-carlo-stat portal-monte-carlo-stat-${item.tone}`}
                  key={item.label}
                >
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
          </article>

          <article className="portal-analytics-card portal-benchmark-card">
            <div className="portal-card-head">
              <span className="portal-shell-kicker">STRATEGY VS BENCHMARKS</span>
              <span className="portal-shell-pill">SAME WINDOW</span>
            </div>

            <div className="portal-benchmark-bars" aria-label="Strategy benchmark comparison">
              {portalBenchmarkComparison.map((item) => (
                <article className="portal-benchmark-bar" key={item.label}>
                  <div className="portal-benchmark-track">
                    <span
                      className={`portal-benchmark-fill portal-benchmark-fill-${item.tone}`}
                      style={{ '--portal-benchmark-height': `${item.height}%` }}
                    />
                  </div>

                  <strong>{item.value}</strong>
                  <h3>{item.label}</h3>
                  <p>{item.note}</p>
                </article>
              ))}
            </div>

            <div className="portal-benchmark-footer">
              <span>Alpha vs S&amp;P 500</span>
              <strong>{`+${alphaVsSp500} pts`}</strong>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function PortalFlywheelSection() {
  const { ref, isVisible } = useViewportReveal();

  return (
    <section
      ref={ref}
      className={`spread portal-flywheel-spread${isVisible ? ' is-motion-visible' : ''}`}
      id="flywheel"
    >
      <div className="campaign-grid portal-flywheel-grid">
        <div className="portal-section-copy">
          <p className="section-kicker">Flywheel</p>
          <h2>The loop is the product advantage.</h2>
          <p className="micro-intro">
            Data Portal makes the cycle inspectable: what came in, what was generated, what got
            replayed, what shipped, and what came back as evidence.
          </p>
        </div>

        <div className="portal-flywheel-stage" aria-label="Decision flywheel">
          <div className="portal-flywheel-ring" aria-hidden="true" />

          <article className="portal-flywheel-core">
            <span className="portal-shell-kicker">DECISION FLYWHEEL</span>
            <strong>Research → risk → execution → evidence.</strong>
            <p>Every edge needs both imagination and memory.</p>
          </article>

          {portalFlywheelSteps.map((step, index) => (
            <article
              className={`portal-flywheel-node portal-flywheel-node-${step.tone} portal-flywheel-node-${step.slot}`}
              key={step.title}
              style={{ '--portal-step-delay': `${index * 70}ms` }}
            >
              <span className="portal-flywheel-order">{String(index + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PortalFabricSection() {
  const { ref, isVisible } = useViewportReveal();

  return (
    <section
      ref={ref}
      className={`spread portal-fabric-spread${isVisible ? ' is-motion-visible' : ''}`}
      id="fabric"
    >
      <div className="portal-fabric-shell">
        <div className="campaign-grid portal-fabric-grid">
          <div className="portal-fabric-copy">
            <p className="section-kicker-light">Data Fabric</p>
            <h2>One research surface. Multiple evidence layers.</h2>
            <p className="micro-intro-light">
              This is where the work becomes inspectable: ingest, experiments, replay, audit, and
              promotion gates all tied to the same decision timeline.
            </p>
          </div>

          <div className="portal-fabric-lanes">
            {portalFabricLanes.map((lane, index) => (
              <article
                className={`portal-fabric-lane portal-fabric-lane-${lane.tone}`}
                key={lane.title}
                style={{ '--portal-lane-delay': `${index * 80}ms` }}
              >
                <span className="portal-shell-kicker">
                  LAYER {String(index + 1).padStart(2, '0')}
                </span>
                <h3>{lane.title}</h3>
                <div className="portal-fabric-items">
                  {lane.items.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="portal-fabric-footer">
            <p>
              The point is not just to generate more strategy ideas. It is to keep a clean memory of
              what was tested, why it passed, and when it should be retired.
            </p>

            <div className="portal-fabric-actions">
              <a className="portal-dark-cta" href="https://app.novaquant.cloud">
                Get Started
              </a>
              <a className="portal-ghost-link" href="/">
                Back to Main Page
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function DataPortalPage() {
  return (
    <>
      <PortalHero />
      <PortalBacktestSection />
      <PortalAnalyticsSection />
      <PortalFlywheelSection />
      <PortalFabricSection />
    </>
  );
}

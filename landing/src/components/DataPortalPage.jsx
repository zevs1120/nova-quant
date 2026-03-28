import { useEffect, useState } from 'react';
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
import { useMotionPreference, useViewportReveal } from '../hooks/useViewportMotion.js';

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

function formatAnimatedValue(value, motion) {
  if (!motion) return '';

  const prefix = motion.prefix ?? '';
  const suffix = motion.suffix ?? '';
  const decimals = motion.decimals ?? 0;
  return `${prefix}${value.toFixed(decimals)}${suffix}`;
}

function useAnimatedMetric(motion, isActive, disabled) {
  const target = motion?.value ?? 0;
  const decimals = motion?.decimals ?? 0;

  const [currentValue, setCurrentValue] = useState(target);

  useEffect(() => {
    if (!motion) return undefined;

    if (disabled) {
      setCurrentValue(target);
      return undefined;
    }

    if (!isActive) {
      setCurrentValue(0);
      return undefined;
    }

    const duration = motion.duration ?? 1000;
    const from = motion.from ?? 0;
    let rafId = 0;
    let startTime = 0;

    setCurrentValue(from);

    const tick = (timestamp) => {
      if (!startTime) startTime = timestamp;

      const progress = Math.min(1, (timestamp - startTime) / duration);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const nextValue = from + (target - from) * easedProgress;

      setCurrentValue(progress >= 1 ? target : nextValue);

      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [decimals, disabled, isActive, motion, target]);

  if (!motion) return '';
  return formatAnimatedValue(Number(currentValue.toFixed(decimals)), motion);
}

function AnimatedMetricValue({ value, motion, isActive, disabled }) {
  const animatedValue = useAnimatedMetric(motion, isActive, disabled);

  return <>{motion ? animatedValue : value}</>;
}

function AnimatedMetricRange({ value, rangeMotion, isActive, disabled }) {
  const startValue = useAnimatedMetric(rangeMotion?.start, isActive, disabled);
  const endValue = useAnimatedMetric(rangeMotion?.end, isActive, disabled);

  if (!rangeMotion) return <>{value}</>;

  return (
    <>
      {startValue}
      {'-'}
      {endValue}
    </>
  );
}

function PortalHero({ reduceMotion = false }) {
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
                <strong>
                  <AnimatedMetricValue
                    disabled={reduceMotion}
                    isActive={isVisible}
                    motion={item.motion}
                    value={item.value}
                  />
                </strong>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PortalBacktestSection({ reduceMotion = false }) {
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
          <h2>Replay before release.</h2>
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
                  style={{
                    '--portal-line-height': `${Math.max(18, value)}%`,
                    '--portal-bar-order': index,
                  }}
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
                <strong>
                  <AnimatedMetricValue
                    disabled={reduceMotion}
                    isActive={isVisible}
                    motion={item.motion}
                    value={item.value}
                  />
                </strong>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PortalAnalyticsSection({ reduceMotion = false }) {
  const { ref, isVisible } = useViewportReveal();
  const strategyReturn = Number.parseFloat(portalBenchmarkComparison[0]?.value ?? '0');
  const sp500Return = Number.parseFloat(portalBenchmarkComparison[1]?.value ?? '0');
  const alphaVsSp500 = Math.round(strategyReturn - sp500Return);
  const alphaMotion = {
    value: alphaVsSp500,
    prefix: alphaVsSp500 >= 0 ? '+' : '',
    suffix: ' pts',
    decimals: 0,
    duration: 980,
  };

  return (
    <section
      ref={ref}
      className={`spread portal-analytics-spread${isVisible ? ' is-motion-visible' : ''}`}
      id="analytics"
    >
      <div className="campaign-grid portal-analytics-grid">
        <div className="portal-section-copy">
          <p className="section-kicker">Analytics</p>
          <h2>Read the edge.</h2>
          <p className="micro-intro">
            The portal should show where return came from, how future paths distribute, and how the
            strategy compares against broad market baselines like the S&amp;P 500 and Nasdaq.
          </p>
        </div>

        <div className="portal-analytics-stage">
          <article className="portal-analytics-card portal-heatmap-card">
            <div className="portal-card-head">
              <span className="portal-shell-kicker">HEATMAP</span>
              <span className="portal-shell-pill">MONTHLY</span>
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

                {portalMonthlyHeatmap.map((row, rowIndex) => (
                  <div className="portal-heatmap-row" key={row.year} role="row">
                    <span className="portal-heatmap-year" role="rowheader">
                      {row.year}
                    </span>

                    {row.values.map((value, index) => (
                      <span
                        className={`portal-heatmap-cell portal-heatmap-cell-${getHeatmapTone(value)}`}
                        key={`${row.year}-${portalHeatmapMonths[index]}`}
                        role="cell"
                        style={{ '--portal-cell-order': rowIndex * 12 + index }}
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
              <span className="portal-shell-kicker">MONTE CARLO</span>
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

                {portalMonteCarloPaths.map((path, index) => (
                  <polyline
                    className={`portal-monte-carlo-path portal-monte-carlo-path-${path.tone}`}
                    fill="none"
                    key={path.label}
                    pathLength="100"
                    points={buildMonteCarloPath(path.values)}
                    style={{ '--portal-path-order': index }}
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
                  <strong>
                    {item.rangeMotion ? (
                      <AnimatedMetricRange
                        disabled={reduceMotion}
                        isActive={isVisible}
                        rangeMotion={item.rangeMotion}
                        value={item.value}
                      />
                    ) : (
                      <AnimatedMetricValue
                        disabled={reduceMotion}
                        isActive={isVisible}
                        motion={item.motion}
                        value={item.value}
                      />
                    )}
                  </strong>
                </article>
              ))}
            </div>
          </article>

          <article className="portal-analytics-card portal-benchmark-card">
            <div className="portal-card-head">
              <span className="portal-shell-kicker">VS BENCHMARKS</span>
              <span className="portal-shell-pill">SAME WINDOW</span>
            </div>

            <div className="portal-benchmark-bars" aria-label="Strategy benchmark comparison">
              {portalBenchmarkComparison.map((item, index) => (
                <article className="portal-benchmark-bar" key={item.label}>
                  <div className="portal-benchmark-track">
                    <span
                      className={`portal-benchmark-fill portal-benchmark-fill-${item.tone}`}
                      style={{
                        '--portal-benchmark-height': `${item.height}%`,
                        '--portal-bar-order': index,
                      }}
                    />
                  </div>

                  <div className="portal-benchmark-copy">
                    <strong>
                      <AnimatedMetricValue
                        disabled={reduceMotion}
                        isActive={isVisible}
                        motion={item.motion}
                        value={item.value}
                      />
                    </strong>
                    <h3>{item.label}</h3>
                    <p>{item.note}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="portal-benchmark-footer">
              <span>Alpha vs S&amp;P 500</span>
              <strong>
                <AnimatedMetricValue
                  disabled={reduceMotion}
                  isActive={isVisible}
                  motion={alphaMotion}
                  value={`${alphaMotion.prefix}${alphaVsSp500} pts`}
                />
              </strong>
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
          <h2>The loop compounds.</h2>
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
            <h2>One surface. Full memory.</h2>
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
  const reduceMotion = useMotionPreference('(prefers-reduced-motion: reduce)');

  return (
    <>
      <PortalHero reduceMotion={reduceMotion} />
      <PortalBacktestSection reduceMotion={reduceMotion} />
      <PortalAnalyticsSection reduceMotion={reduceMotion} />
      <PortalFlywheelSection />
      <PortalFabricSection />
    </>
  );
}

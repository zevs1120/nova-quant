import {
  portalBacktestMetrics,
  portalCurveBars,
  portalFabricLanes,
  portalFlywheelSteps,
  portalHeroStats,
} from '../data/index.js';
import { useViewportReveal } from '../hooks/useViewportMotion.js';

function PortalHero() {
  const { ref, isVisible } = useViewportReveal({ threshold: 0.14 });

  return (
    <section
      ref={ref}
      className={`spread portal-hero-spread${isVisible ? ' is-motion-visible' : ''}`}
      id="portal-top"
    >
      <div className="campaign-grid portal-hero-grid">
        <div className="portal-hero-copy">
          <p className="section-kicker">Data Portal</p>
          <h1>
            <span>Backtest the edge.</span>
            <span>See the flywheel.</span>
          </h1>
          <p className="micro-intro">
            The product may feel quiet, but the machinery behind it is not. Data Portal is where
            the research loop, replay system, and promotion evidence become visible.
          </p>

          <div className="portal-hero-stats" aria-label="Data portal summary metrics">
            {portalHeroStats.map((item) => (
              <article className="portal-mini-stat" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
        </div>

        <div className="portal-hero-stage" aria-hidden="true">
          <div className="portal-flat portal-flat-pink" />
          <div className="portal-flat portal-flat-blue" />
          <div className="portal-flat portal-flat-mint" />

          <article className="portal-stage-shell">
            <div className="portal-stage-head">
              <span className="portal-shell-kicker">RESEARCH REPLAY</span>
              <span className="portal-shell-pill">MODEL 2.9 / LIVE</span>
            </div>

            <div className="portal-stage-metric-row">
              <div className="portal-stage-metric">
                <span>Best regime</span>
                <strong>Momentum</strong>
              </div>
              <div className="portal-stage-metric">
                <span>Gate status</span>
                <strong>Passed</strong>
              </div>
            </div>

            <div className="portal-stage-curve">
              {portalCurveBars.map((value, index) => (
                <span
                  key={`${value}-${index}`}
                  style={{ '--portal-bar-height': `${value}%`, '--portal-bar-order': index }}
                />
              ))}
            </div>

            <div className="portal-stage-tags">
              <span>Out-of-sample verified</span>
              <span>Execution-aware</span>
              <span>Replayable decisions</span>
            </div>
          </article>

          <article className="portal-sidecar">
            <span className="portal-shell-kicker">STRATEGY PACK</span>
            <strong>12.4K scenarios</strong>
            <p>Parameter sweeps, walk-forward slices, and regime-aware validation.</p>
          </article>
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
              <article className={`portal-metric-card portal-metric-card-${item.tone}`} key={item.label}>
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
                <span className="portal-shell-kicker">LAYER {String(index + 1).padStart(2, '0')}</span>
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
              The point is not just to generate more strategy ideas. It is to keep a clean memory
              of what was tested, why it passed, and when it should be retired.
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
      <PortalFlywheelSection />
      <PortalFabricSection />
    </>
  );
}

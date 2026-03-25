import { statementActionCards, ribbons } from '../data/index.js';
import { STAGE_HEIGHT_REM } from '../hooks/useStatementFan.js';

/**
 * Statement section with interactive fanned action card stack and brand ribbon.
 *
 * @param {{ activeCard: number, onCardSelect: (i: number) => void, fan: object }} props
 */
export default function StatementSection({ activeCard, onCardSelect, fan }) {
  const { viewportRef, scalerRef, stageRef, scale, fitWidthPx } = fan;

  return (
    <section className="spread statement-spread" id="features">
      <div className="campaign-grid statement-grid">
        <div className="statement-copy">
          <p className="section-kicker">Not built to look familiar</p>
          <h2>
            More clarity.
            <br />
            Less friction.
          </h2>
          <p className="micro-intro">
            NovaQuant is designed to help you see what matters faster - without the clutter,
            density, and friction of traditional trading interfaces. It replaces noise with
            clarity, so the market feels easier to read and easier to act on.
          </p>
        </div>

        <div className="statement-showcase" aria-label="NovaQuant action card stack">
          <div
            className="statement-showcase-accent statement-showcase-accent-a"
            aria-hidden="true"
          />
          <div
            className="statement-showcase-accent statement-showcase-accent-b"
            aria-hidden="true"
          />
          <div
            ref={viewportRef}
            className="statement-stack-viewport"
            style={{
              height: `${STAGE_HEIGHT_REM * scale}rem`,
            }}
          >
            <div
              ref={scalerRef}
              className="statement-stack-scaler"
              style={{
                width: fitWidthPx != null ? `${fitWidthPx}px` : undefined,
                transform: `scale(${scale})`,
              }}
            >
              <div ref={stageRef} className="statement-stack-stage">
                {statementActionCards.map((card, index) => (
                  <button
                    type="button"
                    key={card.symbol}
                    className={`statement-stack-slot statement-stack-slot-${card.tone}${activeCard === index ? ' is-selected' : ''}`}
                    style={{
                      '--stack-x': card.layout.x,
                      '--stack-y': card.layout.y,
                      '--stack-r': card.layout.r,
                      '--stack-z': card.layout.z,
                      '--stack-delay': card.layout.delay,
                    }}
                    aria-pressed={activeCard === index}
                    onClick={() => onCardSelect(index)}
                    onFocus={() => onCardSelect(index)}
                  >
                    <article className="statement-action-card statement-action-card-stack">
                      <div className="statement-action-card-head">
                        <span className="statement-action-kicker">{card.kicker}</span>
                        <span className="statement-action-tag">{card.tag}</span>
                      </div>

                      <div className="statement-action-main">
                        <div className="statement-action-symbol-block">
                          <h3 className="statement-action-symbol">{card.symbol}</h3>
                          <p className="statement-action-direction">{card.direction}</p>
                          <p className="statement-action-meta">{card.meta}</p>
                        </div>
                        <span className="statement-action-mark" aria-hidden="true" />
                      </div>

                      <div className="statement-action-stats">
                        {card.stats.map((item) => (
                          <div className="statement-action-stat" key={item.label}>
                            <span className="statement-action-stat-label">{item.label}</span>
                            <span className="statement-action-stat-value">{item.value}</span>
                          </div>
                        ))}
                      </div>

                      <div className="statement-action-context-row">
                        {card.context.map((item) => (
                          <span className="statement-action-context-pill" key={item.label}>
                            <span className="statement-action-context-label">{item.label}</span>
                            <span className="statement-action-context-value">{item.value}</span>
                          </span>
                        ))}
                      </div>

                      <div className="statement-action-links">
                        <span className="statement-action-link statement-action-link-primary">
                          Open Robinhood
                        </span>
                        <span className="statement-action-link statement-action-link-secondary">
                          Ask Nova
                        </span>
                      </div>
                    </article>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ribbon-track" aria-label="Brand lines">
        {ribbons.map((item) => (
          <span className="ribbon-item" key={item}>
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

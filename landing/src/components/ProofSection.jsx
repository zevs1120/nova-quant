import { architectureSteps } from '../data/index.js';
import { useViewportReveal } from '../hooks/useViewportMotion.js';

export default function ProofSection() {
  const { ref, isVisible } = useViewportReveal();

  return (
    <section
      ref={ref}
      className={`spread proof-spread${isVisible ? ' is-motion-visible' : ''}`}
      id="marvix"
    >
      <div className="campaign-grid proof-grid">
        <div className="proof-intro">
          <p className="section-kicker">AI-powered backend</p>
          <h2>Marvix does the heavy lifting.</h2>
          <p className="micro-intro">
            The intelligence lives behind the surface. The user meets the result, not the burden.
          </p>

          <div className="proof-flow" aria-label="NovaQuant product architecture">
            {architectureSteps.map((step, index) => (
              <div
                className="proof-flow-step"
                key={step.title}
                style={{
                  '--proof-order': index,
                  '--proof-enter-delay': `${index * 70}ms`,
                }}
              >
                <article className={`proof-node proof-node-${step.tone}`}>
                  <p className="proof-node-kicker">Layer {String(index + 1).padStart(2, '0')}</p>
                  <h3>{step.title}</h3>
                  <div className="proof-node-pills">
                    {step.items.map((item) => (
                      <span className="proof-node-pill" key={item}>
                        {item}
                      </span>
                    ))}
                  </div>
                </article>

                {index < architectureSteps.length - 1 ? (
                  <div className="proof-flow-arrow" aria-hidden="true">
                    <span className="proof-flow-line" />
                    <span className="proof-flow-head" />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

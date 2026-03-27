import { useRef, useState } from 'react';
import { pricingPlans } from '../data/index.js';
import { useViewportReveal } from '../hooks/useViewportMotion.js';

export default function PricingSection() {
  const { ref, isVisible } = useViewportReveal();
  const boardRef = useRef(null);
  const [activePlan, setActivePlan] = useState(null);

  const handlePointerMove = (event) => {
    const board = boardRef.current;
    if (!board) return;

    const rect = board.getBoundingClientRect();
    board.style.setProperty('--pricing-glow-x', `${event.clientX - rect.left}px`);
    board.style.setProperty('--pricing-glow-y', `${event.clientY - rect.top}px`);
  };

  const clearBoardFocus = () => {
    setActivePlan(null);
  };

  return (
    <section
      ref={ref}
      className={`spread pricing-spread${isVisible ? ' is-motion-visible' : ''}`}
      id="pricing"
    >
      <div className="campaign-grid pricing-grid">
        <div className="pricing-copy">
          <p className="section-kicker">Pricing</p>
          <h2>4 ways to enter.</h2>
        </div>

        <div
          ref={boardRef}
          className={`pricing-board${activePlan != null ? ' has-plan-focus' : ''}`}
          aria-label="Pricing plans"
          onPointerMove={handlePointerMove}
          onPointerLeave={clearBoardFocus}
        >
          {pricingPlans.map((plan, index) => (
            <article
              className={`pricing-card pricing-card-${plan.tone}${activePlan === index ? ' is-highlighted' : ''}`}
              key={plan.name}
              style={{
                '--pricing-order': index,
                '--pricing-enter-delay': `${index * 95}ms`,
              }}
              onPointerEnter={() => setActivePlan(index)}
              onFocus={() => setActivePlan(index)}
              onBlur={clearBoardFocus}
            >
              <div className="pricing-card-glow" aria-hidden="true" />

              <div className="pricing-card-top">
                <p className="pricing-plan-name">{plan.name}</p>
                <p className="pricing-plan-blurb">{plan.blurb}</p>
              </div>

              <div className="pricing-value" aria-label={`${plan.name} price`}>
                <span className="pricing-amount">{plan.price}</span>
                {plan.cadence ? <span className="pricing-cadence">{plan.cadence}</span> : null}
              </div>

              <p className="pricing-includes">Includes</p>

              <ul className="pricing-features">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>

              <a className="pricing-cta" href="https://app.novaquant.cloud">
                {plan.cta}
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

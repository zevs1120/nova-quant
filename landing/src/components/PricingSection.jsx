import { useEffect, useRef, useState } from 'react';
import { pricingPlans } from '../data/index.js';
import { useMotionPreference, useViewportReveal } from '../hooks/useViewportMotion.js';

export default function PricingSection() {
  const { ref, isVisible } = useViewportReveal();
  const boardRef = useRef(null);
  const [activePlan, setActivePlan] = useState(null);
  const canHover = useMotionPreference('(hover: hover) and (pointer: fine)');

  /* Clear highlight when device loses hover capability (e.g. tablet detach keyboard). */
  useEffect(() => {
    if (!canHover) setActivePlan(null);
  }, [canHover]);

  const handlePointerMove = (event) => {
    const board = boardRef.current;
    if (!board || !canHover || event.pointerType !== 'mouse') return;

    const rect = board.getBoundingClientRect();
    board.style.setProperty('--pricing-glow-x', `${event.clientX - rect.left}px`);
    board.style.setProperty('--pricing-glow-y', `${event.clientY - rect.top}px`);
  };

  const clearBoardFocus = () => {
    setActivePlan(null);
  };

  const handlePointerEnter = (index, event) => {
    if (!canHover || event.pointerType !== 'mouse') return;
    setActivePlan(index);
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
                '--pricing-enter-delay': `${index * 70}ms`,
              }}
              onPointerEnter={(event) => handlePointerEnter(index, event)}
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

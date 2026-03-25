import { pricingPlans } from '../data/index.js';

export default function PricingSection() {
  return (
    <section className="spread pricing-spread" id="pricing">
      <div className="campaign-grid pricing-grid">
        <div className="pricing-copy">
          <p className="section-kicker">Pricing</p>
          <h2>4 ways to enter.</h2>
        </div>

        <div className="pricing-board" aria-label="Pricing plans">
          {pricingPlans.map((plan) => (
            <article className={`pricing-card pricing-card-${plan.tone}`} key={plan.name}>
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

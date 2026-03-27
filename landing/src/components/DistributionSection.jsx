import { distributionCredits } from '../data/index.js';
import { useViewportReveal } from '../hooks/useViewportMotion.js';

export default function DistributionSection() {
  const { ref, isVisible } = useViewportReveal();

  return (
    <section
      ref={ref}
      className={`spread distribution-spread${isVisible ? ' is-motion-visible' : ''}`}
      id="about"
    >
      <div className="campaign-grid distribution-grid">
        <div className="distribution-copy">
          <p className="distribution-kicker">Distribution</p>
          <h2>Before there was a product,</h2>
        </div>

        <p className="distribution-lead">There were people.</p>

        <div className="distribution-pairs" aria-label="Distribution credits">
          {distributionCredits.map((item, index) => (
            <div
              className="distribution-pair"
              key={item.name}
              style={{ '--distribution-enter-delay': `${index * 80}ms` }}
            >
              <p className="distribution-story-line">{item.story}</p>
              <div className="distribution-credit">
                <p className="distribution-name">{item.name}</p>
                <p className="distribution-role">{item.role}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="distribution-closing">
          Founded in 2026, NovaQuant began as a search for a calmer, sharper way to read the market
          — and still carries that spirit in everything it is.
        </p>
      </div>
    </section>
  );
}

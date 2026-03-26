import { distributionCredits } from '../data/index.js';

export default function DistributionSection() {
  return (
    <section className="spread distribution-spread" id="about">
      <div className="campaign-grid distribution-grid">
        <div className="distribution-copy">
          <p className="distribution-kicker">Distribution</p>
          <h2>Before there was a product,</h2>
        </div>

        <p className="distribution-lead">There were people.</p>

        <div className="distribution-pairs" aria-label="Distribution credits">
          {distributionCredits.map((item) => (
            <div className="distribution-pair" key={item.name}>
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

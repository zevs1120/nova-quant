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

        <div className="distribution-context">
          <div className="distribution-story">
            <p>Someone who saw it first.</p>
            <p>Someone who built it.</p>
            <p>Someone who believed early.</p>
            <p>Someone whose work changed the way we saw the whole thing.</p>
          </div>
        </div>

        <div className="distribution-credits" aria-label="Distribution credits">
          {distributionCredits.map((item) => (
            <div className="distribution-credit" key={item.name}>
              <p className="distribution-name">{item.name}</p>
              <p className="distribution-role">{item.role}</p>
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

import { useViewportReveal } from '../hooks/useViewportMotion.js';

const askBullets = ['Ask what matters now', 'Get answers, not overload', 'AI that speaks human'];

export default function AskSection() {
  const { ref, isVisible } = useViewportReveal();

  return (
    <section
      ref={ref}
      className={`spread ask-spread${isVisible ? ' is-motion-visible' : ''}`}
      id="ask"
    >
      <div className="campaign-grid ask-grid">
        <div className="ask-copy">
          <p className="section-kicker">Ask Nova</p>
          <h2>
            Noise out.
            <br />
            Nova in.
          </h2>
          <p className="micro-intro">
            Ask Nova is built for the moments when you do not want more charts, tabs, or jargon -
            just a smart answer. Ask about setups, sentiment, momentum, risk, or what deserves
            attention now, and get a response you can actually use.
          </p>

          <ul className="ask-bullets" aria-label="Ask Nova highlights">
            {askBullets.map((bullet, index) => (
              <li key={bullet} style={{ '--ask-enter-delay': `${index * 70}ms` }}>
                {bullet}
              </li>
            ))}
          </ul>
        </div>

        <div className="ask-object">
          <div className="ask-object-halo" aria-hidden="true" />
          <div className="ask-object-chip ask-object-chip-query">What matters now?</div>
          <div className="ask-object-chip ask-object-chip-answer">
            Summarized in one clean brief.
          </div>
          <img
            src="/brand-assets/ask-nova-shot.jpg"
            alt="Ask Nova interface showing a plain-language response card."
          />
        </div>
      </div>
    </section>
  );
}

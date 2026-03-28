import { useViewportReveal } from '../hooks/useViewportMotion.js';

const askBullets = ['Ask what matters now', 'Get answers, not overload', 'AI that speaks human'];
const askFollowups = [
  'What should I do today?',
  'Is it safe to try anything?',
  'What breaks the setup?',
];
const askActionPoints = [
  'Wait for a reclaim and hold before treating this as actionable.',
  'If it confirms, start with smaller size instead of full conviction size.',
  'If price slips back under the trigger, stay flat and let the setup reset.',
];
const askEvidenceTags = ['Watchlist First', 'Starter Size', 'Risk Gate Active'];

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

          <div className="ask-phone-stage" aria-hidden="true">
            <div className="ask-phone-flat ask-phone-flat-pink" />
            <div className="ask-phone-flat ask-phone-flat-blue" />
            <div className="ask-phone-flat ask-phone-flat-mint" />

            <div className="ask-phone-shell">
              <div className="ask-phone-frame">
                <div className="ask-phone-island" />

                <div className="ask-phone-screen">
                  <div className="ask-phone-ui">
                    <div className="ask-phone-statusbar">
                      <span>9:41</span>
                      <span>NovaQuant Live</span>
                    </div>

                    <div className="ask-phone-header">
                      <div className="ask-phone-header-copy">
                        <span className="ask-phone-header-kicker">Ask Nova</span>
                        <strong>Signal Brief</strong>
                      </div>
                      <span className="ask-phone-header-pill">Live</span>
                    </div>

                    <div className="ask-phone-thread">
                      <div className="ask-phone-thread-scroll">
                        <span className="ask-phone-thread-scroll-thumb" />
                      </div>

                      <div className="ask-phone-thread-track">
                        <div className="ask-phone-message ask-phone-message-user">
                          <div className="ask-phone-bubble ask-phone-bubble-user">
                            Read the signal on AAPL right now.
                          </div>
                        </div>

                        <div className="ask-phone-thinking">
                          <div className="ask-phone-thinking-dots">
                            <span />
                            <span />
                            <span />
                          </div>
                          <span>Checking setup, regime, and risk gate...</span>
                        </div>

                        <article className="ask-phone-reply">
                          <span className="ask-phone-reply-kicker">Signal Read</span>
                          <h3>AAPL is improving, but the clean long still needs confirmation.</h3>
                          <p className="ask-phone-reply-lead">
                            Momentum is rebuilding, but price has not given a full reclaim-and-hold
                            yet. That keeps this in watchlist-first territory rather than immediate
                            action.
                          </p>

                          <div className="ask-phone-reply-block">
                            <span>What matters</span>
                            <p>
                              Leadership is intact and the tape is calmer, but conviction is still
                              below the level where Nova would push a full-size action card.
                            </p>
                          </div>

                          <div className="ask-phone-reply-block">
                            <span>What to do</span>
                            <ul>
                              {askActionPoints.map((point) => (
                                <li key={point}>{point}</li>
                              ))}
                            </ul>
                          </div>

                          <div className="ask-phone-reply-block">
                            <span>Bottom line</span>
                            <p>
                              This is a clean watchlist candidate, not a full green-light entry.
                              Let the market prove it first, then size up only if the reclaim
                              sticks.
                            </p>
                          </div>

                          <div className="ask-phone-reply-tags">
                            {askEvidenceTags.map((tag) => (
                              <span key={tag}>{tag}</span>
                            ))}
                          </div>
                        </article>

                        <div className="ask-phone-followups">
                          {askFollowups.map((item) => (
                            <span key={item}>{item}</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="ask-phone-composer">
                      <div className="ask-phone-input">
                        <span className="ask-phone-input-placeholder">Ask in plain words</span>
                        <span className="ask-phone-input-text">
                          <span className="ask-phone-input-typed">
                            Read the signal on AAPL right now.
                          </span>
                          <span className="ask-phone-input-caret" />
                        </span>
                      </div>

                      <div className="ask-phone-send">
                        <span className="ask-phone-send-icon">↑</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

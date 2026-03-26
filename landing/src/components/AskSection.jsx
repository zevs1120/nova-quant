export default function AskSection() {
  return (
    <section className="spread ask-spread" id="ask">
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
            <li>Ask what matters now</li>
            <li>Get answers, not overload</li>
            <li>AI that speaks human</li>
          </ul>
        </div>

        <div className="ask-object">
          <div className="ask-object-halo" aria-hidden="true" />
          <img
            src="/brand-assets/ask-nova-shot.jpg"
            alt="Ask Nova interface showing a plain-language response card."
          />
        </div>
      </div>
    </section>
  );
}

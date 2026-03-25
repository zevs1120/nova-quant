const proofPoints = [
  'Evidence-backed daily decision surfaces',
  'Risk-aware workflow instead of hype-driven prompts',
  'One stack for research, review, and execution discipline',
];

const outcomes = [
  'Start the day with a structured market read instead of scattered tabs.',
  'See what changed, what matters, and what deserves action right now.',
  'Keep a repeatable process across signals, risk, and post-trade review.',
];

export default function App() {
  return (
    <div className="page-shell">
      <div className="ambient ambient-left" aria-hidden="true" />
      <div className="ambient ambient-right" aria-hidden="true" />

      <main className="page">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Nova Quant</p>
            <h1>Trade with a process, not a pulse.</h1>
            <p className="lede">
              An AI-native decision platform for self-directed traders who want calmer
              execution, clearer signals, and evidence they can inspect.
            </p>

            <div className="hero-actions">
              <a className="button button-primary" href="https://novaquant.cloud">
                Open product
              </a>
              <a className="button button-secondary" href="#proof">
                See how it works
              </a>
            </div>
          </div>

          <aside className="hero-card" aria-label="Product highlights">
            <p className="card-kicker">What it is</p>
            <ul className="proof-list">
              {proofPoints.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </aside>
        </section>

        <section className="band" id="proof">
          <div className="section-heading">
            <p className="eyebrow">Why teams start here</p>
            <h2>A thinner surface over a deeper operating system.</h2>
          </div>

          <div className="grid-three">
            <article className="panel">
              <p className="panel-index">01</p>
              <h3>Decision first</h3>
              <p>
                Built to answer what you should do next, not just flood you with charts,
                feeds, or pseudo-intelligence.
              </p>
            </article>

            <article className="panel">
              <p className="panel-index">02</p>
              <h3>Evidence visible</h3>
              <p>
                Signals, risk context, and supporting research stay inspectable, so the
                product does not ask for blind trust.
              </p>
            </article>

            <article className="panel">
              <p className="panel-index">03</p>
              <h3>Discipline reinforced</h3>
              <p>
                The workflow is designed to reduce impulsive trading and keep users inside a
                repeatable operating rhythm.
              </p>
            </article>
          </div>
        </section>

        <section className="split-band">
          <div className="section-heading narrow">
            <p className="eyebrow">What users get</p>
            <h2>Less noise. More decision clarity.</h2>
          </div>

          <div className="stack">
            {outcomes.map((item) => (
              <article className="line-card" key={item}>
                <p>{item}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="cta-band">
          <div>
            <p className="eyebrow">Current rollout</p>
            <h2>Landing page on `www`, product stays where it is.</h2>
            <p className="cta-copy">
              This first version keeps the main app on the current product domain so the team
              can launch a public-facing page without disrupting the live stack.
            </p>
          </div>

          <a className="button button-primary" href="https://novaquant.cloud">
            Enter Nova Quant
          </a>
        </section>
      </main>
    </div>
  );
}

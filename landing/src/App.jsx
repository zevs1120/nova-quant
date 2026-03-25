import { useState } from 'react';

const ribbons = [
  'Signals translated',
  'The market, reframed',
  'Clarity before action',
  'Intelligence in plain language',
];

const architectureSteps = [
  {
    title: 'Market Data',
    items: ['Equities', 'Crypto', 'Realtime feeds', 'Snapshots'],
    tone: 'mint',
  },
  {
    title: 'Marvix',
    items: ['Signal generation', 'Strategy generation', 'Backtesting', 'Adaptation'],
    tone: 'blue',
  },
  {
    title: 'Decision Engine',
    items: ['Confidence', 'Risk gating', 'Action cards', 'Portfolio context'],
    tone: 'pink',
  },
  {
    title: 'Execution + Evidence',
    items: ['Paper / Live', 'Reconciliation', 'Replay', 'Validation'],
    tone: 'violet',
  },
  {
    title: 'Product Experience',
    items: ['Today', 'Ask Nova', 'Browse', 'My'],
    tone: 'yellow',
  },
  {
    title: 'Research Ops + Lifecycle',
    items: ['Alpha Lab', 'Shadow → Canary → Prod', 'Governance'],
    tone: 'ink',
  },
];

const statementActionCards = [
  {
    symbol: 'NVDA',
    direction: 'Buy setup',
    meta: 'Model-derived · live · LEADERSHIP_BREAK',
    kicker: 'Today pick 01',
    tag: 'Actionable',
    tone: 'blue',
    layout: { x: '-46%', y: '18%', r: '-12deg', z: 1, delay: '0s' },
    stats: [
      { label: 'Conviction', value: '71%' },
      { label: 'Size', value: '8% only' },
      { label: 'Risk', value: 'Medium risk' },
    ],
    context: [
      { label: 'Source', value: 'Model-derived' },
      { label: 'Execution', value: 'Model-derived' },
      { label: 'Risk gate', value: 'Size controlled' },
    ],
  },
  {
    symbol: 'TSLA',
    direction: 'Reduce risk',
    meta: 'Model-derived · live · VOL_BREAKDOWN',
    kicker: 'Today pick 02',
    tag: 'Actionable',
    tone: 'pink',
    layout: { x: '-24%', y: '8%', r: '-7deg', z: 2, delay: '0.1s' },
    stats: [
      { label: 'Conviction', value: '69%' },
      { label: 'Size', value: '9% only' },
      { label: 'Risk', value: 'High risk' },
    ],
    context: [
      { label: 'Source', value: 'Model-derived' },
      { label: 'Execution', value: 'Model-derived' },
      { label: 'Risk gate', value: 'Do not add risk' },
    ],
  },
  {
    symbol: 'AAPL',
    direction: 'Watch first',
    meta: 'Model-derived · live · RANGE_RESPECT',
    kicker: 'Today pick 03',
    tag: 'Watch first',
    tone: 'mint',
    layout: { x: '0%', y: '0%', r: '-1deg', z: 3, delay: '0.2s' },
    stats: [
      { label: 'Conviction', value: '64%' },
      { label: 'Size', value: '7% only' },
      { label: 'Risk', value: 'Low risk' },
    ],
    context: [
      { label: 'Source', value: 'Model-derived' },
      { label: 'Execution', value: 'Wait for follow-through' },
      { label: 'Risk gate', value: 'Stay patient' },
    ],
  },
  {
    symbol: 'BTC',
    direction: 'Momentum intact',
    meta: 'Model-derived · live · TREND_ACCELERATION',
    kicker: 'Today pick 04',
    tag: 'Actionable',
    tone: 'violet',
    layout: { x: '24%', y: '8%', r: '7deg', z: 4, delay: '0.3s' },
    stats: [
      { label: 'Conviction', value: '76%' },
      { label: 'Size', value: '10% only' },
      { label: 'Risk', value: 'High risk' },
    ],
    context: [
      { label: 'Source', value: 'Model-derived' },
      { label: 'Execution', value: 'Crypto session live' },
      { label: 'Risk gate', value: 'Tight invalidation' },
    ],
  },
  {
    symbol: 'ETH',
    direction: 'Wait for reclaim',
    meta: 'Model-derived · live · SUPPORT_RETEST',
    kicker: 'Today pick 05',
    tag: 'Watch first',
    tone: 'yellow',
    layout: { x: '46%', y: '18%', r: '12deg', z: 5, delay: '0.4s' },
    stats: [
      { label: 'Conviction', value: '61%' },
      { label: 'Size', value: '6% only' },
      { label: 'Risk', value: 'Medium risk' },
    ],
    context: [
      { label: 'Source', value: 'Model-derived' },
      { label: 'Execution', value: 'Wait for reclaim' },
      { label: 'Risk gate', value: 'Hold the line' },
    ],
  },
];

const pricingPlans = [
  {
    name: 'Free',
    price: 'Free',
    cadence: '',
    blurb: 'Try the experience',
    features: [
      'limited daily market read',
      'limited Ask Nova questions',
      'limited browse access',
      'delayed or capped AI trade ideas',
      'paper mode only',
    ],
    cta: 'Start free',
    tone: 'mint',
  },
  {
    name: 'Lite',
    price: '$19',
    cadence: '/ week',
    blurb: 'AI market clarity, every day',
    features: [
      'full daily AI market read',
      'more Ask Nova access',
      'AI-powered trade ideas',
      'stocks + crypto coverage',
      'basic risk context',
      'saved watchlist / preferences',
    ],
    cta: 'Choose Lite',
    tone: 'blue',
  },
  {
    name: 'Pro',
    price: '$29',
    cadence: '/ week',
    blurb: 'AI that helps you decide',
    features: [
      'everything in Lite',
      'unlimited or high-limit Ask Nova',
      'deeper AI trade analysis',
      'stronger risk / conviction context',
      'more advanced signals',
      'priority access to new features',
      'richer opportunity discovery',
      'portfolio-aware insights',
    ],
    cta: 'Choose Pro',
    tone: 'pink',
  },
  {
    name: 'Ultra',
    price: '$49',
    cadence: '/ week',
    blurb: 'AI that can trade with you',
    features: [
      'everything in Pro',
      'automated trading',
      'auto-execution rules',
      'portfolio-linked automation',
      'advanced risk controls',
      'premium signals',
      'highest-priority model access',
      'white-glove support',
    ],
    cta: 'Choose Ultra',
    tone: 'yellow',
  },
];

const faqs = [
  {
    question: 'Do I need trading or quant experience to use NovaQuant?',
    answer:
      'No. NovaQuant is built for people who want better market clarity without needing to think like a quant. You don’t need to code, build models, or know the language of professional trading tools to get value from it.',
  },
  {
    question: 'What exactly does NovaQuant’s AI do?',
    answer:
      'NovaQuant uses AI to help you understand what matters, surface potential opportunities, and make sense of the market in plain English. Instead of leaving you alone with charts, tabs, and jargon, it helps turn noise into something more clear, structured, and actionable.',
  },
  {
    question: 'What is Ask Nova?',
    answer:
      'Ask Nova is your AI guide inside NovaQuant. You can ask about what matters today, explore ideas, understand market moves, and get answers in plain English — without digging through complicated tools or traditional trading interfaces.',
  },
  {
    question: 'Is NovaQuant fully automated?',
    answer:
      'No. NovaQuant is designed to help you think more clearly and act with more context, not remove you from the decision entirely. It helps surface ideas, explain what’s happening, and support better judgment — while keeping you in control.',
  },
  {
    question: 'Can I use NovaQuant without writing code?',
    answer:
      'Yes. NovaQuant is designed so you can use AI-powered trading intelligence without writing strategies, scripts, or technical logic yourself. The product is built to feel intuitive, even if you’ve never touched a quant tool before.',
  },
  {
    question: 'What markets does NovaQuant support?',
    answer:
      'NovaQuant currently focuses on the markets most people care about first, including stocks and crypto. Support may expand over time, but the goal is simple: make modern market intelligence easier to access, without the complexity of traditional platforms.',
  },
];

const reactions = [
  {
    quote: 'Finally, a market product that tells me what matters before it tells me what to click.',
    source: 'Anonymous early reaction',
    className: 'voice-card voice-card-a',
  },
  {
    quote: 'The interface is quiet. The thinking behind it is not.',
    source: 'Studio note',
    className: 'voice-card voice-card-b',
  },
  {
    quote: 'Ask Nova feels less like searching and more like getting briefed by someone sharp.',
    source: 'First-look reaction',
    className: 'voice-card voice-card-c',
  },
  {
    quote: 'It does not perform “finance app.” It performs clarity.',
    source: 'Editorial impression',
    className: 'voice-card voice-card-d',
  },
  {
    quote: 'This is the first time the market has felt edited instead of amplified.',
    source: 'Anonymous product note',
    className: 'voice-card voice-card-e',
  },
];

const distributionCredits = [
  {
    name: 'Yadi Qiao',
    role: 'For the concept.',
  },
  {
    name: 'Bowen Yang',
    role: 'For the code.',
  },
  {
    name: 'Tao Yang',
    role: 'For the early belief.',
  },
  {
    name: 'Andy Warhol',
    role: 'For the visual language.',
  },
];

const legalLinks = [
  {
    label: 'Open App',
    href: 'https://novaquant.cloud',
  },
  {
    label: 'Guide',
    href: '#guide',
  },
  {
    label: 'About',
    href: '#about',
  },
  {
    label: 'novaquant.cloud',
    href: 'https://novaquant.cloud',
  },
];

const legalParagraphs = [
  'NovaQuant is an AI-driven quant trading tool built for advisory-grade market intelligence, designed to turn market signals into actionable intelligence and help clients act with greater speed, clarity, and confidence. Registration and advisory services are subject to applicable regulatory approvals, jurisdictional limits, and client suitability requirements. Past performance does not guarantee future results.',
  'Market data, model output, assistant responses, and interface summaries may be delayed, incomplete, or inaccurate. Screens, workflows, and examples shown here are illustrative product snapshots and may change as the system evolves.',
  'All investing and trading involve risk, including the possible loss of capital. Users remain responsible for their own decisions, execution, position sizing, tax treatment, and compliance obligations. If a decision matters, verify the underlying facts independently before acting.',
  'Nothing on this site constitutes an offer, solicitation, or recommendation in any jurisdiction where such offer or solicitation is not authorized. Access to products, features, and advisory services may be limited by jurisdiction, eligibility, onboarding status, and applicable law, and will be governed by the relevant client agreements and disclosures in effect at the time of use.',
];

const legalNotes = [
  'Access, availability, and supported actions may vary by product state and release stage.',
];

export default function App() {
  const [activeStatementCard, setActiveStatementCard] = useState(2);

  return (
    <div className="world">
      <div className="page-noise" aria-hidden="true" />
      <div className="page-gradient page-gradient-one" aria-hidden="true" />
      <div className="page-gradient page-gradient-two" aria-hidden="true" />

      <header className="site-header-shell">
        <div className="site-header">
          <a className="site-brand" href="#top" aria-label="NovaQuant home">
            <img
              className="site-brand-logo"
              src="/brand-assets/nova-logo.png"
              alt="NovaQuant"
            />
          </a>

          <nav className="site-nav" aria-label="Primary">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#guide">FAQ</a>
            <a href="#about">Distrbution</a>
          </nav>

          <a className="site-header-cta" href="https://novaquant.cloud">
            sign up
          </a>
        </div>
      </header>

      <main className="page-shell" id="top">
        <section className="spread hero-spread">
          <div className="campaign-grid hero-grid">
            <div className="hero-stage" aria-hidden="true">
              <div className="hero-stage-grid" />
              <div className="hero-flat hero-flat-lilac halftone-field" />
              <div className="hero-flat hero-flat-blue" />
              <div className="hero-flat hero-flat-pink halftone-field" />
              <div className="hero-flat hero-flat-violet" />
              <div className="hero-flat hero-flat-mint" />
            </div>

            <div className="hero-copy">
              <p className="hero-pretitle">Hello World, I am NovaQuant</p>
              <h1 className="hero-title">
                <span className="hero-title-top">Read the day</span>
                <span className="hero-title-bottom">differently.</span>
              </h1>
              <p className="micro-intro">
                NovaQuant turns market complexity into clear daily intelligence, powered
                by Marvix, our in-house AI model built to surface what matters and help
                you act with more clarity.
              </p>

              <div className="hero-actions">
                <a className="hero-cta" href="https://novaquant.cloud">
                  Get started
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="spread statement-spread" id="features">
          <div className="campaign-grid statement-grid">
            <div className="statement-copy">
              <p className="section-kicker">Not built to look familiar</p>
              <h2>
                More clarity.
                <br />
                Less friction.
              </h2>
              <p className="micro-intro">
                NovaQuant is designed to help you see what matters faster - without the
                clutter, density, and friction of traditional trading interfaces. It
                replaces noise with clarity, so the market feels easier to read and
                easier to act on.
              </p>
            </div>

            <div className="statement-showcase" aria-label="NovaQuant action card stack">
              <div className="statement-showcase-accent statement-showcase-accent-a" aria-hidden="true" />
              <div className="statement-showcase-accent statement-showcase-accent-b" aria-hidden="true" />
              <div className="statement-stack-stage">
                {statementActionCards.map((card, index) => (
                  <button
                    type="button"
                    key={card.symbol}
                    className={`statement-stack-slot statement-stack-slot-${card.tone}${activeStatementCard === index ? ' is-selected' : ''}`}
                    style={{
                      '--stack-x': card.layout.x,
                      '--stack-y': card.layout.y,
                      '--stack-r': card.layout.r,
                      '--stack-z': card.layout.z,
                      '--stack-delay': card.layout.delay,
                    }}
                    aria-pressed={activeStatementCard === index}
                    onClick={() => setActiveStatementCard(index)}
                    onFocus={() => setActiveStatementCard(index)}
                  >
                    <article className="statement-action-card statement-action-card-stack">
                      <div className="statement-action-card-head">
                        <span className="statement-action-kicker">{card.kicker}</span>
                        <span className="statement-action-tag">{card.tag}</span>
                      </div>

                      <div className="statement-action-main">
                        <div className="statement-action-symbol-block">
                          <h3 className="statement-action-symbol">{card.symbol}</h3>
                          <p className="statement-action-direction">{card.direction}</p>
                          <p className="statement-action-meta">{card.meta}</p>
                        </div>
                        <span className="statement-action-mark" aria-hidden="true" />
                      </div>

                      <div className="statement-action-stats">
                        {card.stats.map((item) => (
                          <div className="statement-action-stat" key={item.label}>
                            <span className="statement-action-stat-label">{item.label}</span>
                            <span className="statement-action-stat-value">{item.value}</span>
                          </div>
                        ))}
                      </div>

                      <div className="statement-action-context-row">
                        {card.context.map((item) => (
                          <span className="statement-action-context-pill" key={item.label}>
                            <span className="statement-action-context-label">{item.label}</span>
                            <span className="statement-action-context-value">{item.value}</span>
                          </span>
                        ))}
                      </div>

                      <div className="statement-action-links">
                        <span className="statement-action-link statement-action-link-primary">
                          Open Robinhood
                        </span>
                        <span className="statement-action-link statement-action-link-secondary">
                          Ask Nova
                        </span>
                      </div>
                    </article>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="ribbon-track" aria-label="Brand lines">
            {ribbons.map((item) => (
              <span className="ribbon-item" key={item}>
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="spread proof-spread" id="marvix">
          <div className="campaign-grid proof-grid">
            <div className="proof-intro">
              <p className="section-kicker">AI-powered backend</p>
              <h2>Marvix does the heavy lifting.</h2>
              <p className="micro-intro">
                The intelligence lives behind the surface. The user meets the result, not the burden.
              </p>

              <div className="proof-flow" aria-label="NovaQuant product architecture">
                {architectureSteps.map((step, index) => (
                  <div className="proof-flow-step" key={step.title}>
                    <article className={`proof-node proof-node-${step.tone}`}>
                      <p className="proof-node-kicker">Layer {String(index + 1).padStart(2, '0')}</p>
                      <h3>{step.title}</h3>
                      <div className="proof-node-pills">
                        {step.items.map((item) => (
                          <span className="proof-node-pill" key={item}>
                            {item}
                          </span>
                        ))}
                      </div>
                    </article>

                    {index < architectureSteps.length - 1 ? (
                      <div className="proof-flow-arrow" aria-hidden="true">
                        <span className="proof-flow-line" />
                        <span className="proof-flow-head" />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

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
                Ask Nova is built for the moments when you do not want more charts, tabs,
                or jargon - just a smart answer. Ask about setups, sentiment, momentum,
                risk, or what deserves attention now, and get a response you can actually use.
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

                  <a className="pricing-cta" href="https://novaquant.cloud">
                    {plan.cta}
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="spread faq-spread" id="guide">
          <div className="campaign-grid faq-grid">
            <div className="faq-intro">
              <h2>FAQ</h2>
            </div>

            <div className="faq-board">
              {faqs.map((item) => (
                <details className="faq-item" key={item.question}>
                  <summary>
                    <span className="faq-question">{item.question}</span>
                  </summary>
                  <p className="faq-answer">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="spread voices-spread">
          <div className="campaign-grid voices-grid">
            <div className="voices-title-block">
              <p className="voices-kicker">First reactions</p>
              <h2 className="voices-title">
                <span>In their words,</span>
                <span>NovaQuant.</span>
              </h2>
            </div>

            {reactions.map((item) => (
              <blockquote className={item.className} key={item.quote}>
                <p>{item.quote}</p>
                <cite>{item.source}</cite>
              </blockquote>
            ))}

            <a className="voices-link" href="https://novaquant.cloud" id="enter">
              Open NovaQuant
            </a>
          </div>
        </section>

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
              Founded in 2026, NovaQuant began as a search for a calmer, sharper way to
              read the market — and still carries that spirit in everything it is.
            </p>
          </div>
        </section>

        <section className="spread legal-spread" id="legal">
          <div className="legal-surface">
            <div className="campaign-grid legal-grid">
              <div className="legal-topbar">
                <a className="legal-brand" href="#top" aria-label="NovaQuant home">
                  <img
                    className="legal-brand-logo"
                    src="/brand-assets/nova-logo.png"
                    alt="NovaQuant"
                  />
                </a>

                <nav className="legal-links" aria-label="Footer">
                  {legalLinks.map((link) => (
                    <a href={link.href} key={link.label}>
                      {link.label}
                    </a>
                  ))}
                </nav>
              </div>

              <div className="legal-copy">
                {legalParagraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>

              <div className="legal-meta">
                <p className="legal-copyright">© 2026 NovaQuant. All rights reserved.</p>
                <p className="legal-heading">Important Notes</p>

                <div className="legal-notes">
                  {legalNotes.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>

                <a className="legal-privacy" href="#guide">
                  Your privacy choices
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

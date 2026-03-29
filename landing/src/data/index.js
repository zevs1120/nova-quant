/**
 * Landing page content data.
 * All arrays are presentation-only — no runtime logic.
 */

export const ribbons = [
  'Signals translated',
  'The market, reframed',
  'Clarity before action',
  'Intelligence in plain language',
];

export const architectureSteps = [
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

export const portalHeroStats = [
  {
    label: 'Replay windows',
    value: '12Y',
    motion: { value: 12, suffix: 'Y', decimals: 0, duration: 960 },
  },
  {
    label: 'Backtests logged',
    value: '18.4K',
    motion: { value: 18.4, suffix: 'K', decimals: 1, duration: 1080 },
  },
  {
    label: 'Decision traces',
    value: '42M',
    motion: { value: 42, suffix: 'M', decimals: 0, duration: 1140 },
  },
];

export const portalCurveBars = [19, 24, 29, 27, 35, 44, 42, 53, 60, 63, 73, 89];

export const portalBacktestMetrics = [
  {
    label: 'Net return',
    value: '+151%',
    tone: 'mint',
    motion: { value: 151, prefix: '+', suffix: '%', decimals: 0, duration: 1100 },
  },
  {
    label: 'Sharpe',
    value: '1.61',
    tone: 'blue',
    motion: { value: 1.61, decimals: 2, duration: 920 },
  },
  {
    label: 'Max DD',
    value: '-11.8%',
    tone: 'pink',
    motion: { value: -11.8, suffix: '%', decimals: 1, duration: 980 },
  },
  {
    label: 'Hit rate',
    value: '59%',
    tone: 'yellow',
    motion: { value: 59, suffix: '%', decimals: 0, duration: 1020 },
  },
];

export const portalHeatmapMonths = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const portalMonthlyHeatmap = [
  { year: '2023', values: [2.5, -1.4, 3.4, 1.9, -0.7, 3.9, 1.5, -1.9, 2.3, 3.6, 1.4, 2.9] },
  { year: '2024', values: [3.3, 2.1, -0.8, 4.6, 2.7, -2.1, 3.9, 1.9, 1.5, -0.4, 3.1, 4.2] },
  { year: '2025', values: [2.2, 4.1, 2.7, -1.2, 4.9, 2.0, -0.7, 3.6, 3.0, 1.4, 4.3, 2.4] },
  { year: '2026 YTD', values: [2.7, 1.6, 2.2, null, null, null, null, null, null, null, null, null] },
];

export const portalMonteCarloPaths = [
  { label: 'P10', tone: 'pink', values: [100, 101, 101, 103, 102, 105, 105, 108, 110, 112, 111, 108] },
  { label: 'P25', tone: 'yellow', values: [100, 103, 104, 106, 108, 111, 113, 116, 119, 121, 123, 125] },
  { label: 'Median', tone: 'blue', values: [100, 104, 107, 111, 115, 119, 123, 128, 132, 136, 140, 144] },
  { label: 'P75', tone: 'mint', values: [100, 105, 110, 115, 120, 125, 131, 137, 143, 149, 155, 161] },
  { label: 'P90', tone: 'violet', values: [100, 106, 112, 119, 126, 134, 142, 150, 159, 167, 176, 184] },
];

export const portalMonteCarloStats = [
  {
    label: 'Median value',
    value: '$144k',
    tone: 'blue',
    motion: { value: 144, prefix: '$', suffix: 'k', decimals: 0, duration: 1080 },
  },
  {
    label: '90% band',
    value: '$108k-$184k',
    tone: 'violet',
    rangeMotion: {
      start: { value: 108, prefix: '$', suffix: 'k', decimals: 0, duration: 980 },
      end: { value: 184, prefix: '$', suffix: 'k', decimals: 0, duration: 1120 },
    },
  },
  {
    label: 'Positive paths',
    value: '75%',
    tone: 'mint',
    motion: { value: 75, suffix: '%', decimals: 0, duration: 1040 },
  },
];

export const portalBenchmarkComparison = [
  {
    label: 'NovaQuant strategy',
    value: '+151%',
    height: 100,
    tone: 'ink',
    note: 'Model-led live / replay window',
    motion: { value: 151, prefix: '+', suffix: '%', decimals: 0, duration: 1100 },
  },
  {
    label: 'S&P 500',
    value: '+98%',
    height: 65,
    tone: 'blue',
    note: 'Same lookback window',
    motion: { value: 98, prefix: '+', suffix: '%', decimals: 0, duration: 980 },
  },
  {
    label: 'Nasdaq',
    value: '+126%',
    height: 83,
    tone: 'pink',
    note: 'Same lookback window',
    motion: { value: 126, prefix: '+', suffix: '%', decimals: 0, duration: 1040 },
  },
];

export const portalFlywheelSteps = [
  {
    title: 'Collect',
    body: 'Market feeds, snapshots, and execution traces enter one governed timeline.',
    tone: 'mint',
    slot: 'north-west',
  },
  {
    title: 'Generate',
    body: 'Marvix spins new signals, features, and strategy variants from the same substrate.',
    tone: 'blue',
    slot: 'north-east',
  },
  {
    title: 'Replay',
    body: 'Candidates are backtested, stress-tested, and ranked before they ever surface.',
    tone: 'pink',
    slot: 'east',
  },
  {
    title: 'Deploy',
    body: 'Only gated edges graduate from shadow to canary to live with evidence attached.',
    tone: 'yellow',
    slot: 'south-east',
  },
  {
    title: 'Learn',
    body: 'Every decision comes back as audit data for the next model, next regime, next loop.',
    tone: 'violet',
    slot: 'south-west',
  },
];

export const portalFabricLanes = [
  {
    title: 'Data Ingest',
    items: ['Realtime feeds', 'Snapshots', 'Feature windows'],
    tone: 'blue',
  },
  {
    title: 'Research Log',
    items: ['Experiment registry', 'Versioned params', 'Notebook provenance'],
    tone: 'mint',
  },
  {
    title: 'Replay + Audit',
    items: ['Trade-by-trade replay', 'Decision snapshots', 'Execution reconciliation'],
    tone: 'pink',
  },
  {
    title: 'Promotion Gates',
    items: ['Shadow / Canary / Prod', 'Risk thresholds', 'Rollback hooks'],
    tone: 'yellow',
  },
];

export const statementActionCards = [
  {
    symbol: 'NVDA',
    direction: 'Buy setup',
    meta: 'Model-derived · live · LEADERSHIP_BREAK',
    kicker: 'Today pick 01',
    tag: 'Actionable',
    tone: 'blue',
    layout: { x: '-34%', y: '8%', r: '-9deg', z: 1, delay: '0s' },
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
    layout: { x: '-16%', y: '3.5%', r: '-5deg', z: 2, delay: '0.1s' },
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
    layout: { x: '16%', y: '3.5%', r: '5deg', z: 4, delay: '0.3s' },
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
    layout: { x: '34%', y: '8%', r: '9deg', z: 5, delay: '0.4s' },
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

export const pricingPlans = [
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

export const faqs = [
  {
    question: 'Do I need trading or quant experience to use NovaQuant?',
    answer:
      'No. NovaQuant is built for people who want better market clarity without needing to think like a quant. You don\'t need to code, build models, or know the language of professional trading tools to get value from it.',
  },
  {
    question: 'What exactly does NovaQuant\'s AI do?',
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
      'No. NovaQuant is designed to help you think more clearly and act with more context, not remove you from the decision entirely. It helps surface ideas, explain what\'s happening, and support better judgment — while keeping you in control.',
  },
  {
    question: 'Can I use NovaQuant without writing code?',
    answer:
      'Yes. NovaQuant is designed so you can use AI-powered trading intelligence without writing strategies, scripts, or technical logic yourself. The product is built to feel intuitive, even if you\'ve never touched a quant tool before.',
  },
  {
    question: 'What markets does NovaQuant support?',
    answer:
      'NovaQuant currently focuses on the markets most people care about first, including stocks and crypto. Support may expand over time, but the goal is simple: make modern market intelligence easier to access, without the complexity of traditional platforms.',
  },
];

export const reactions = [
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
    quote: 'It does not perform "finance app." It performs clarity.',
    source: 'Editorial impression',
    className: 'voice-card voice-card-d',
  },
  {
    quote: 'This is the first time the market has felt edited instead of amplified.',
    source: 'Anonymous product note',
    className: 'voice-card voice-card-e',
  },
];

export const distributionCredits = [
  { name: 'Yadi Qiao', role: 'For the concept.', story: 'Someone who saw it first.' },
  { name: 'Bowen Yang', role: 'For the code.', story: 'Someone who built it.' },
  { name: 'Tao Yang', role: 'For the early belief.', story: 'Someone who believed early.' },
  {
    name: 'Andy Warhol',
    role: 'For the visual language.',
    story: 'Someone whose work changed the way we saw the whole thing.',
  },
];

export const legalLinks = [
  { label: 'Get Started', href: 'https://app.novaquant.cloud' },
  { label: 'Guide', href: '#guide' },
  { label: 'Distribution', href: '#about' },
  { label: 'app.novaquant.cloud', href: 'https://app.novaquant.cloud' },
];

export const legalParagraphs = [
  'NovaQuant is an AI-driven quant trading tool built for advisory-grade market intelligence, designed to turn market signals into actionable intelligence and help clients act with greater speed, clarity, and confidence. Registration and advisory services are subject to applicable regulatory approvals, jurisdictional limits, and client suitability requirements. Past performance does not guarantee future results.',
  'Market data, model output, assistant responses, and interface summaries may be delayed, incomplete, or inaccurate. Screens, workflows, and examples shown here are illustrative product snapshots and may change as the system evolves.',
  'All investing and trading involve risk, including the possible loss of capital. Users remain responsible for their own decisions, execution, position sizing, tax treatment, and compliance obligations. If a decision matters, verify the underlying facts independently before acting.',
  'Nothing on this site constitutes an offer, solicitation, or recommendation in any jurisdiction where such offer or solicitation is not authorized. Access to products, features, and advisory services may be limited by jurisdiction, eligibility, onboarding status, and applicable law, and will be governed by the relevant client agreements and disclosures in effect at the time of use.',
];

export const legalNotes = [
  'Access, availability, and supported actions may vary by product state and release stage.',
];

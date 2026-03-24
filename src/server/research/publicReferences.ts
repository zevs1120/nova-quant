export type ResearchReferenceKind = 'paper' | 'dataset' | 'official_docs';

export interface ResearchReference {
  ref_id: string;
  title: string;
  publisher: string;
  kind: ResearchReferenceKind;
  url: string;
  summary: string;
  coverage: Array<'factors' | 'strategies' | 'execution'>;
}

const PUBLIC_RESEARCH_REFERENCES: ResearchReference[] = [
  {
    ref_id: 'ff_3_factor',
    title: 'Description of Fama/French Factors',
    publisher: 'Kenneth R. French Data Library',
    kind: 'dataset',
    url: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library/f-f_factors.html',
    summary:
      'Canonical public construction notes for market, size, and value factors in U.S. equities.',
    coverage: ['factors', 'strategies'],
  },
  {
    ref_id: 'ff_5_factor',
    title: 'Description of Fama/French 5 Factors (2x3)',
    publisher: 'Kenneth R. French Data Library',
    kind: 'dataset',
    url: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library/f-f_5_factors_2x3.html',
    summary:
      'Public specification for value, size, profitability, and investment factor construction.',
    coverage: ['factors', 'strategies'],
  },
  {
    ref_id: 'ff_data_library',
    title: 'Kenneth R. French Data Library',
    publisher: 'Kenneth R. French Data Library',
    kind: 'dataset',
    url: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library.html',
    summary:
      'Public factor and breakpoint catalog covering momentum, value, profitability, investment, and size research series.',
    coverage: ['factors', 'strategies'],
  },
  {
    ref_id: 'aqr_qmj',
    title: 'Quality Minus Junk',
    publisher: 'AQR',
    kind: 'paper',
    url: 'https://www.aqr.com/Insights/Research/Working-Paper/Quality-Minus-Junk',
    summary:
      'Public quality factor research framing profitability, growth, safety, and payout as a cross-sectional quality premium.',
    coverage: ['factors', 'strategies'],
  },
  {
    ref_id: 'aqr_bab',
    title: 'Betting Against Beta',
    publisher: 'AQR',
    kind: 'paper',
    url: 'https://www.aqr.com/Insights/Research/Journal-Article/Betting-Against-Beta',
    summary:
      'Public defensive and low-risk factor reference for low beta and leverage-constrained anomaly design.',
    coverage: ['factors', 'strategies'],
  },
  {
    ref_id: 'aqr_vme',
    title: 'Value and Momentum Everywhere',
    publisher: 'AQR',
    kind: 'paper',
    url: 'https://www.aqr.com/Insights/Research/Journal-Article/Value-and-Momentum-Everywhere',
    summary:
      'Cross-asset public evidence supporting value and momentum families across equities, currencies, commodities, and bonds.',
    coverage: ['factors', 'strategies'],
  },
  {
    ref_id: 'aqr_factor_momentum',
    title: 'Factor Momentum Everywhere',
    publisher: 'AQR',
    kind: 'paper',
    url: 'https://www.aqr.com/Insights/Research/Working-Paper/Factor-Momentum-Everywhere',
    summary:
      'Public reference for factor rotation and overlay logic based on persistence in factor returns themselves.',
    coverage: ['factors', 'strategies'],
  },
  {
    ref_id: 'aqr_trend_following',
    title: 'A Century of Evidence on Trend-Following Investing',
    publisher: 'AQR',
    kind: 'paper',
    url: 'https://www.aqr.com/Insights/Research/White-Papers/A-Century-of-Evidence-on-Trend-Following-Investing',
    summary:
      'Public long-horizon trend-following evidence for time-series momentum and breakout style strategy design.',
    coverage: ['factors', 'strategies'],
  },
  {
    ref_id: 'nber_pairs_trading',
    title: 'Pairs Trading: Performance of a Relative Value Arbitrage Rule',
    publisher: 'NBER',
    kind: 'paper',
    url: 'https://www.nber.org/papers/w7032',
    summary:
      'Classic public reference for relative-value and pairs mean-reversion strategy construction.',
    coverage: ['strategies'],
  },
  {
    ref_id: 'nber_pead',
    title: 'Investor Inattention and Friday Earnings Announcements',
    publisher: 'NBER',
    kind: 'paper',
    url: 'https://www.nber.org/papers/w11683',
    summary:
      'Public evidence for limited-attention and post-earnings announcement drift style continuation strategies.',
    coverage: ['strategies'],
  },
  {
    ref_id: 'alpaca_orders',
    title: 'Create an Order',
    publisher: 'Alpaca Docs',
    kind: 'official_docs',
    url: 'https://docs.alpaca.markets/reference/postorder',
    summary:
      'Official order submission reference for broker execution routing in equities and crypto via Alpaca.',
    coverage: ['execution'],
  },
  {
    ref_id: 'alpaca_cancel_order',
    title: 'Cancel an Order by Order ID',
    publisher: 'Alpaca Docs',
    kind: 'official_docs',
    url: 'https://docs.alpaca.markets/reference/deleteorderbyorderid-1',
    summary:
      'Official cancel-order reference for Alpaca execution control and kill-switch support.',
    coverage: ['execution'],
  },
  {
    ref_id: 'alpaca_get_order',
    title: 'Get an Order by Order ID',
    publisher: 'Alpaca Docs',
    kind: 'official_docs',
    url: 'https://docs.alpaca.markets/reference/getorderbyorderid',
    summary: 'Official order-status query reference for execution state sync and reconciliation.',
    coverage: ['execution'],
  },
  {
    ref_id: 'binance_spot_orders',
    title: 'Spot Trading Endpoints',
    publisher: 'Binance Developers',
    kind: 'official_docs',
    url: 'https://developers.binance.com/docs/binance-spot-api-docs/rest-api/trading-endpoints',
    summary: 'Official spot order, query, and cancel endpoints for Binance execution routing.',
    coverage: ['execution'],
  },
];

const PUBLIC_RESEARCH_REFERENCE_MAP = new Map(
  PUBLIC_RESEARCH_REFERENCES.map((row) => [row.ref_id, row]),
);

export function listPublicResearchReferences() {
  return PUBLIC_RESEARCH_REFERENCES;
}

export function getPublicResearchReference(refId?: string | null) {
  if (!refId) return null;
  return PUBLIC_RESEARCH_REFERENCE_MAP.get(String(refId).trim()) || null;
}

export function resolvePublicResearchReferences(refIds?: ReadonlyArray<string> | null) {
  return (refIds || [])
    .map((refId) => getPublicResearchReference(refId))
    .filter((row): row is ResearchReference => Boolean(row));
}

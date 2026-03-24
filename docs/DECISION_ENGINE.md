# Nova Quant Decision Engine

Last updated: 2026-03-23

Nova Quant is not a raw signal feed. The product homepage is intentionally minimal because
the backend now makes an explicit decision before anything reaches the user.

## Goal

Convert raw market observations and research outputs into a small set of auditable,
portfolio-aware, user-facing actions.

Canonical chain:

```text
raw observations
-> features / factors
-> research signals
-> eligible signals
-> risk state + regime policy
-> portfolio intent
-> personalized action cards
-> evidence bundle
-> grounded assistant explanation
```

## Runtime Objects

Main implementation:

- [`src/server/decision/engine.ts`](../src/server/decision/engine.ts)

Primary API surfaces:

- `POST /api/decision/today`
- `GET /api/decision/audit`
- `GET /api/runtime-state` (includes baseline decision object)

Persistence:

- `decision_snapshots`

## Core Semantics

The system now distinguishes:

1. `research signal`

- strategy/model/rules think something is interesting

2. `eligible signal`

- signal is still actionable after transparency and basic gating checks

3. `risk-adjusted decision`

- top-down regime and risk policy may downgrade, defer, or suppress the signal

4. `portfolio-aware action`

- same signal may mean:
  - open new risk
  - add on strength
  - reduce risk
  - hedge / de-risk
  - defensive hold
  - watch only
  - no action

5. `user-facing action card`

- compact frontend payload for Today page

## Risk State

Risk state is a first-class adjudicator, not a label.

Current machine outputs include:

- volatility regime
- risk-on / risk-off posture
- trend suitability
- mean-reversion suitability
- abnormal correlation context
- breadth proxy
- execution-loss pressure

User-facing summary is intentionally simple:

- 今天可进攻
- 今天适合试探，不适合激进
- 今天优先防守
- 今天不建议做高风险动作

## Action Card Contract

Each ranked action card includes:

- `action`
- `action_label`
- `portfolio_intent`
- `confidence`
- `time_horizon`
- `brief_why_now`
- `risk_note`
- `eligible`
- `entry_zone`
- `stop_loss`
- `take_profit`
- `strategy_source`
- `source_status`
- `data_status`
- `signal_payload`
- `evidence_bundle`

## Evidence Bundle Contract

Every action card must have an evidence bundle with:

- `thesis`
- `supporting_factors`
- `opposing_factors`
- `regime_context`
- `event_context`
- `data_quality`
- `confidence`
- `implementation_caveats`
- `next_action`
- `what_changed`
- `generated_at`

This same bundle is what the assistant should cite when answering:

- why today is defensive
- why this card ranks first
- what changed since yesterday / last snapshot
- what the main risk is
- how the user’s existing book changes the recommendation

## Personalization Boundary

`POST /api/decision/today` accepts user-context holdings supplied by the frontend.

That means the system can personalize using:

- current positions
- same-symbol overlap
- exposure posture
- sector concentration

But it does **not** claim:

- live broker-linked holdings
- custodial account synchronization
- real execution access

When holdings are absent, the system stays honest and returns a universal decision with
`availability = UNPERSONALIZED`.

## Recommendation Outcome Audit

Decision snapshots are persisted for audit and replay under `decision_snapshots`.

Each stored record captures:

- user / market / asset class
- snapshot date
- context hash
- source/data status
- risk state
- portfolio context
- ranked actions
- summary
- top action id

This makes it possible to answer:

- what recommendation the user saw
- what portfolio context was assumed
- what risk posture was active
- what evidence chain backed the action

## Example End-to-End Chain

Example shape:

```json
{
  "input_context": {
    "market": "US",
    "assetClass": "US_STOCK",
    "userId": "guest-123",
    "holdings": [
      { "symbol": "QQQ", "weight_pct": 18, "sector": "ETF" },
      { "symbol": "AAPL", "weight_pct": 14, "sector": "Technology" }
    ]
  },
  "risk_state": {
    "posture": "PROBE",
    "summary": "今天适合试探，不适合激进"
  },
  "top_action": {
    "action_label": "Add on strength",
    "symbol": "AAPL",
    "portfolio_intent": "add_on_strength"
  },
  "evidence_bundle": {
    "thesis": "Setup aligns with the current strategy under a still-usable regime.",
    "supporting_factors": ["trend persistence", "factor alignment"],
    "opposing_factors": ["portfolio concentration is already meaningful"],
    "implementation_caveats": [
      "Entry only inside the defined zone.",
      "Keep size small because posture is PROBE."
    ]
  },
  "assistant_answer_shape": {
    "verdict": "You can act, but only selectively.",
    "why": "The card ranks first because it matches both the signal stack and your existing exposure.",
    "risk": "You already hold correlated equity risk, so size should stay small.",
    "next_step": "Treat this as an add, not a new high-risk bet."
  }
}
```

## Known Real Limits

1. Macro calendar / earnings calendar / analyst revision feeds are not yet fully wired into the
   canonical runtime path, so `event_context` is still partially derived.
2. User context currently comes from local product state, not live custodial account sync.
3. Backtest / replay / paper / live semantics are more aligned than before, but some secondary
   research modules still use older proxy-style assumptions.

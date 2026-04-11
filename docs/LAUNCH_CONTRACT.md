# NovaQuant Launch Contract

Last updated: 2026-04-09

This is the launch-time product, billing, entitlement, data, and readiness contract.
When product copy, frontend entitlement, API guards, checkout, or ops runbooks disagree with
this document, treat the disagreement as a launch blocker.

## 1. Launch Positioning

NovaQuant is an AI-native quant intelligence platform that translates model signals, market
data, and research evidence into plain-language trading decisions.

Launch posture:

- NovaQuant is decision-support intelligence for self-directed traders.
- NovaQuant is not a broker.
- NovaQuant does not auto-trade for launch users.
- NovaQuant does not guarantee return, fill, liquidity, or signal accuracy.
- Users remain responsible for whether, when, where, and how they trade.

## 2. Launch Plans

Launch paid tiers are weekly Early Access subscriptions.

| Plan  | Launch price  | Today action cards     | Ask Nova                       | Portfolio-aware AI | Notes                                    |
| ----- | ------------- | ---------------------- | ------------------------------ | ------------------ | ---------------------------------------- |
| Free  | Free          | 3 complete cards / day | 3 chats / day                  | No                 | Free tier is the trial.                  |
| Lite  | USD 19 / week | 7 complete cards / day | 10 chats / day                 | No                 | Keeps daily Nova concise.                |
| Pro   | USD 29 / week | Complete curated Today | 20 chats / day                 | Yes                | Curated Today is not raw model output.   |
| Ultra | Later         | Complete curated Today | Unlimited / very high fair-use | Yes                | Future tier; do not promise launch date. |

Product rule:

- Do not show extra locked Today cards at launch.
- The app should push only the number of complete action cards a user can use on their plan.
- Pro "complete Today" means the complete Nova-curated action-card book, not every raw signal in
  the database.
- Pro Today should stay experience-bounded. The launch target is no more than 15 high-quality
  curated action cards per day unless product explicitly changes this contract.

## 3. Complete Action Card Contract

Every visible launch Today action card is a complete model-generated trade plan.

Complete means the user can see:

- direction / setup label
- plain-language thesis
- entry
- stop
- take-profit
- model position size or risk-budget size
- risk note
- invalidation / do-not-act condition when available
- data checked time

Position size must be framed as model/risk-budget guidance, not an account-level order.
Do not write launch copy that implies Nova knows the user's exact executable order unless a
broker-specific execution flow provides that fact.

## 4. Action-Card Outcome Tracking

Every pushed action card should be reviewable after publication.

Launch outcome tracking is a market-path audit of the model-generated plan. It is not a claim of
user fills, broker fills, account PnL, audited returns, or realized subscriber performance.

The durable outcome review should preserve:

- decision snapshot id
- action id
- symbol / market / direction
- published snapshot date
- entry low / high
- model entry price
- stop price
- take-profit price
- model position size pct
- whether entry traded
- first detected entry / stop / take-profit review horizon
- maximum favorable / adverse market move after entry
- final action-plan outcome
- close-to-close forward returns for T+1 / T+3 / T+5 compatibility

Launch internal outcome labels:

- `PENDING`
- `INSUFFICIENT_PLAN`
- `ENTRY_NOT_TRIGGERED`
- `TAKE_PROFIT_HIT`
- `STOP_HIT`
- `EXPIRED_FLAT`
- `INCONCLUSIVE`

Do not market hit-rate, win-rate, subscriber PnL, or performance charts until the outcome ledger
has enough samples, a documented methodology, and reviewed performance disclosures.

## 5. Legal / Disclosure Contract

Launch copy must consistently say:

- NovaQuant is market intelligence / decision support for self-directed traders.
- NovaQuant is not a broker.
- NovaQuant does not auto-trade for launch users.
- NovaQuant does not guarantee return, signal accuracy, fills, broker routing, liquidity, tax
  outcome, or suitability.
- Action-card entry / stop / take-profit / size are model-generated plan fields and risk
  boundaries, not an account-specific order instruction.
- The user must verify price, liquidity, fees, borrow/option contract specifics when applicable,
  risk, rules, tax, and personal suitability before acting.

Disclosure surfaces required for paid launch:

- landing legal footer
- paid checkout sheet before redirect / payment
- Today action card compact disclosure
- My / Support / Disclosures screen
- Nova Assistant system safety prompt

Avoid "advisory services", "advisor", "registered adviser", or individualized-investment-advice
claims unless counsel explicitly approves the exact copy.

## 6. Ask Nova Entitlement

Ask Nova is plan-limited at launch:

- Free: 3 chats per day
- Lite: 10 chats per day
- Pro: 20 chats per day
- Ultra: later unlimited / very high fair-use

Product behavior:

- Prefer gentle reminders near the limit.
- At the limit, keep the user oriented with today's summary, next refresh expectation, and a clear
  upgrade path.
- Portfolio / holdings / sizing / account-context questions require Pro.

Technical abuse guards are separate from membership entitlement.

## 7. API Launch Contract

Do not sell or document a public developer API at launch.

Launch API surfaces exist to serve:

- NovaQuant app
- NovaQuant landing / public reads
- NovaQuant admin console
- model / EC2 ingest paths
- Stripe webhooks

Before taking paid public traffic, protect internal APIs against abuse:

- public read routes: IP-level throttle
- auth routes: IP + email-aware throttle
- chat routes: user/session throttle plus membership entitlement
- billing checkout: user/session throttle
- admin routes: admin role required
- model ingest: token required

Developer API belongs to a future Ultra / Enterprise design with API keys, quotas, rate limits,
usage dashboard, overage policy, docs, and support contract.

## 8. Data Freshness Contract

Normal action cards should show a checked time, not an engineering-heavy status grid.

Launch behavior:

- show a compact checked-time on action cards
- strongly warn when a card is stale
- do not present stale or insufficient-data cards as actionable
- do not synthesize entry / stop / target / size when required market data is missing
- keep Data Status / admin health available for deeper inspection

Avoid broad "real-time" claims unless the launch data vendor, endpoint, market, and delay are
explicitly known.

## 9. Billing Policy

Launch billing is deliberately simple:

- No trial.
- Free tier is the trial.
- Paid checkout uses Stripe hosted checkout.
- Paid plans are weekly Early Access subscriptions.
- Cancellation is handled through Stripe / Billing Portal where applicable.
- Cancel = immediately downgrade to Free once Nova receives the cancellation state.
- No refund policy for launch subscriptions.
- Checkout copy must make the weekly cadence, no-trial posture, cancellation behavior, and
  no-refund posture clear before payment.

## 10. Support / Ops Alert Contract

Launch support is email-first:

- public support mailbox: `support@novaquant.cloud`
- user-facing support entry: My / Support / Contact Support
- billing changes / cancellation: Stripe hosted checkout / Billing Portal
- trading boundary: support is not broker customer service, an emergency liquidation desk, a
  trade execution desk, tax advice, legal advice, or individualized investment advice

Ops alert path:

- configure `OPS_ALERT_WEBHOOK_URL` or `DISCORD_WEBHOOK_URL`
- keep an owner for Supabase / Stripe / market-data / LLM / Vercel / EC2 / qlib incidents
- run `npm run check:launch -- --alert-smoke` before paid traffic
- run `npm run check:launch -- --live --notify` during production smoke and after launch-critical
  deployments

Alert on / manually escalate:

- landing / app / admin unreachable
- API `/healthz` failing
- Stripe webhook verification / processing failure
- checkout creation failure
- membership / billing entitlement sync mismatch
- Ask Nova sustained 5xx or abnormal rate limit spikes
- model ingest failure
- market data stale enough to suppress actionable cards
- Today produces zero actionable cards unexpectedly
- qlib bridge unhealthy when enabled

## 11. Launch Go / No-Go

Paid launch is blocked until this smoke path passes against the intended production stack:

- landing domain loads
- app domain loads
- admin domain loads for an admin
- API domain health passes
- new user can sign up
- user can verify email
- user can log in and restore session
- Stripe Lite checkout activates Lite
- Stripe Pro checkout activates Pro
- Stripe cancellation downgrades the user to Free
- webhook signature verification passes
- Free user receives no more than 3 complete Today cards
- Lite user receives no more than 7 complete Today cards
- Pro user receives complete curated Today
- Free 4th Ask Nova chat is blocked with product copy
- Lite 11th Ask Nova chat is blocked with product copy
- Pro 21st Ask Nova chat is blocked with product copy
- Lite portfolio-aware chat is blocked
- Pro portfolio-aware chat is allowed
- each visible action card has entry / stop / take-profit / size / thesis / risk note
- each visible action card has compact checked-time or a stale/insufficient-data warning
- stale cards are not presented as actionable
- action-card outcome resolver persists entry / stop / take-profit plan outcome in `outcome_reviews`
- `npm run verify` passes
- `npm run check:platform` passes
- `npm run check:launch -- --live` passes
- `npm run check:launch -- --alert-smoke` sends a visible ops alert
- production smoke / pro-env E2E passes
- EC2 backend health is visible
- qlib bridge health is visible or explicitly disabled for the launch surface
- Supabase, Stripe, data-provider, LLM, Vercel, and EC2 incidents have an owner and alert path

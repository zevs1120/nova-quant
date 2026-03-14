# Nova Quant Implementation Log

## 2026-03-15 — Perception Layer / New Category Surface Upgrade

### What was implemented
1. Added a backend-generated `perception_layer` object:
- built inside `src/server/engagement/engine.ts`
- grounded in:
  - risk posture
  - Morning Check status
  - recommendation change state
  - whether the day is effectively a no-action day

2. Extended the unified copy system with system-first perception selectors:
- `getPerceptionLayerCopy(...)`
- headline, focus line, confirmation line, and ambient label now derive from real state instead of ad-hoc UI copy

3. Upgraded the Today first fold so the product opens with a lightweight judgment-presence strip:
- it now says, in effect, "the system already made the first cut"
- keeps the homepage minimal
- strengthens the feeling that the user is confirming a decision, not browsing a dashboard

4. Added explicit perception-layer documentation:
- `docs/PERCEPTION_LAYER_DIFFERENTIATION.md`
- explains how NovaQuant differentiates from legacy finance products at the user-perception layer

### Verification
- `npm run -s typecheck` passed
- engagement/copy/API regression tests passed
- `npm run -s build` passed
- `npm run -s verify` passed

## 2026-03-14 — Playful Interaction / Ritual Motion / Mature Personality Upgrade

### What was implemented
1. Extended the engagement engine so ritual state now carries richer arrival/copy/motion fields:
- `arrival_line`
- `ritual_line`
- `humor_line`
- `cta_label`
- `ai_cta_label`
- `opening_line`
- widget `spark`
- `ui_regime_state.motion`

2. Upgraded Today into a more ritualized Morning Check surface without breaking the minimal homepage:
- top action card now reflects:
  - updated vs stable
  - no-action day vs action day
  - checked vs refresh-needed
- Morning Check now feels like a small completion ritual rather than a plain utility card.

3. Added state-driven motion/tone rules in the shared stylesheet:
- `ui-tone-*`
- `ui-motion-*`
- ritual reveal timing
- subtle no-action / defensive / watchful / opportunity differences

4. Improved assistant tone grounding:
- prompts now explicitly allow calm, dry wit
- responses should make restraint feel intelligent, not empty
- demo assistant wording is more characteristic and less generic

5. Added interaction spec:
- `docs/PLAYFUL_INTERACTION_SYSTEM.md`

### Verification
- `npm run -s typecheck` passed
- engagement/research/assistant tests passed
- `npm run -s build` passed
- `npm run -s verify` passed

## 2026-03-14 — Engagement / Morning Check / Calm Recall Upgrade

### What was implemented
1. Added a backend engagement engine:
- `src/server/engagement/engine.ts`
- Converts decision snapshots into:
  - `daily_check_state`
  - `habit_state`
  - `daily_wrap_up`
  - `widget_summary`
  - `notification_center`
  - `ui_regime_state`
  - `notification_preferences`

2. Added persistence for ritual and recall state:
- new DB tables:
  - `user_ritual_events`
  - `notification_events`
  - `user_notification_preferences`

3. Added engagement APIs:
- `POST /api/engagement/state`
- `POST /api/engagement/morning-check`
- `POST /api/engagement/boundary`
- `POST /api/engagement/wrap-up`
- `POST /api/engagement/weekly-review`
- `GET /api/widgets/summary`
- `GET /api/notifications/preview`
- `GET /api/notification-preferences`
- `POST /api/notification-preferences`

4. Wired frontend to backend engagement state:
- `App.jsx` now loads engagement snapshots after decision snapshots
- Morning Check / wrap-up / discipline actions now update backend ritual state
- AI context now carries engagement rhythm summary

5. Upgraded homepage and More surfaces:
- `TodayTab.jsx` now shows a compact Morning Check card
- wrap-up readiness is surfaced as a lightweight follow-up card
- `More -> Discipline` now shows widget preview, notification preview, wrap-up state, and backend-grounded discipline state
- settings now includes calm recall / notification cadence controls

6. Added subtle state-driven UI tone:
- opportunity / watchful / defensive / quiet tone classes now derive from engagement posture

7. Added tests:
- `tests/engagementEngine.test.ts`
- `tests/engagementApi.test.ts`

### Verification
- `npm run -s typecheck` ✅
- targeted engagement/runtime/chat tests ✅
- `npm run -s build` ✅

### Open issues
- widget and notification delivery are currently preview/data-layer contracts, not native mobile delivery
- demo mode still uses local fallback behavior where the explicit demo runtime bypasses backend APIs
- engagement scoring is behavior-aware, but not yet linked to explicit outcome-quality feedback

## 2026-03-14 — Decision Engine + Action Evidence Upgrade

### What was implemented
1. Added a formal decision engine:
- `src/server/decision/engine.ts`
- Converts runtime/evidence signals into:
  - `risk_state`
  - `portfolio_context`
  - `ranked_action_cards`
  - `evidence_summary`
  - `audit`

2. Added decision persistence:
- new DB table: `decision_snapshots`
- repository support for:
  - `upsertDecisionSnapshot`
  - `getLatestDecisionSnapshot`
  - `listDecisionSnapshots`

3. Added decision APIs:
- `POST /api/decision/today`
- `GET /api/decision/audit`
- `/api/runtime-state` now includes `data.decision`

4. Grounded assistant on decision objects:
- AI context now carries `decisionSummary` and `holdingsSummary`
- assistant prompts now explicitly include decision snapshot and holdings summary sections
- chat tool context now includes decision/holdings evidence lines

5. Frontend decision wiring:
- `App.jsx` now requests personalized decision snapshots
- `TodayTab.jsx` now prefers backend decision-ranked actions over local-only signal ranking
- action cards now expose:
  - portfolio intent
  - why now
  - risk note
  - evidence-backed ranking order

6. Added tests:
- `tests/decisionEngine.test.ts`
- `tests/decisionApi.test.ts`
- updated runtime/chat tests for decision grounding

### Files changed
- `src/server/decision/engine.ts`
- `src/server/api/queries.ts`
- `src/server/api/app.ts`
- `src/server/chat/types.ts`
- `src/server/chat/tools.ts`
- `src/server/chat/prompts.ts`
- `src/server/db/schema.ts`
- `src/server/db/repository.ts`
- `src/server/types.ts`
- `src/App.jsx`
- `src/components/AiPage.jsx`
- `src/components/TodayTab.jsx`
- `tests/decisionEngine.test.ts`
- `tests/decisionApi.test.ts`
- `tests/apiRuntimeState.test.ts`
- `tests/chatToolsRuntime.test.ts`
- `docs/DECISION_ENGINE.md`
- `docs/DATA_CONTRACTS.md`
- `README.md`
- `docs/SYSTEM_ARCHITECTURE.md`
- `docs/PROJECT_MEMORY.md`
- `docs/RESEARCH_LOG.md`
- `docs/NEXT_STEPS.md`

### Verification
- `npm run -s typecheck` ✅
- targeted runtime/decision tests ✅
- `npm run -s build` ✅
- `npm run -s verify` ✅

### Open issues
- event intelligence is still partially derived rather than fully backed by macro/earnings feeds
- personalized decision context currently comes from product-side holdings state, not connected custodial accounts
- older secondary research modules still need migration toward the same decision/action schema

## 2026-03-14 — AI-Native Research Assistant Upgrade

### What was implemented
1. Research knowledge layer
- Added `src/server/research/knowledge.ts`
- Introduced:
  - factor taxonomy registry
  - factor metadata cards
  - regime taxonomy
  - strategy metadata registry
  - cross-sectional model catalog
  - failed-idea registry
  - doctrine summary layer

2. Research assistant tool layer
- Added `src/server/research/tools.ts`
- New assistant tools:
  - `get_factor_catalog`
  - `get_factor_definition`
  - `get_factor_interactions`
  - `get_strategy_registry`
  - `get_regime_taxonomy`
  - `get_regime_diagnostics`
  - `run_factor_diagnostics`
  - `compare_factor_performance_by_regime`
  - `get_strategy_evaluation_report`
  - `get_validation_report`
  - `get_backtest_integrity_report`
  - `get_turnover_cost_report`
  - `get_signal_evidence`
  - `explain_why_signal_exists`
  - `explain_why_no_signal`
  - `get_experiment_registry`
  - `get_research_memory`
  - `get_research_workflow_plan`
  - `list_failed_experiments`
  - `summarize_research_on_topic`

3. Evaluation and workflow layer
- Added `src/server/research/evaluation.ts`
- Introduced:
  - strategy evaluation report objects
  - validation report objects
  - experiment registry view
  - factor research snapshot
  - research workflow plan objects
  - research memory view

4. Canonical assistant research mode
- `src/server/chat/service.ts` now routes research-heavy questions into `research-assistant` mode.
- `src/server/chat/tools.ts` now selects research tools and includes them in the context bundle.
- `src/server/chat/prompts.ts` now adds evidence-first research prompt assembly and stricter output expectations for research work.

5. Research API surface
- Added research endpoints under `/api/research/*` for factor catalog, factor detail, interactions, regimes, diagnostics, integrity review, turnover-cost review, failed experiments, and topic summaries.

- Added evaluation/workflow/memory endpoints:
  - `/api/research/evaluation/strategy`
  - `/api/research/validation-report`
  - `/api/research/experiments`
  - `/api/research/memory`
  - `/api/research/workflow`
  - `/api/research/factors/:id/snapshot`

6. Tests
- Added:
  - `tests/researchKnowledge.test.ts`
  - `tests/researchApi.test.ts`
  - `tests/researchEvaluation.test.ts`
- Updated:
  - `tests/chatToolsRuntime.test.ts`
  - `tests/chatPrompt.test.ts`

### Files changed
- `src/server/research/knowledge.ts`
- `src/server/research/tools.ts`
- `src/server/chat/types.ts`
- `src/server/chat/tools.ts`
- `src/server/chat/service.ts`
- `src/server/chat/prompts.ts`
- `src/server/api/app.ts`
- `tests/researchKnowledge.test.ts`
- `tests/researchApi.test.ts`
- `tests/chatToolsRuntime.test.ts`
- `tests/chatPrompt.test.ts`
- `README.md`
- `docs/NOVA_ASSISTANT_ARCHITECTURE.md`
- `docs/RESEARCH_ASSISTANT_TOOLS.md`
- `docs/PROJECT_MEMORY.md`
- `docs/RESEARCH_LOG.md`
- `docs/NEXT_STEPS.md`

### Verification
- `npm run typecheck` ✅
- `npm test` ✅
- `npm run build` ✅

### Open issues
- Factor-level measured performance history is still lighter than taxonomy-level knowledge.
- Research tool orchestration is service-controlled and prompt-routed; strict schema tool calling remains a next step.
- Cross-sectional ML evaluation scaffolding exists as knowledge/catalog for now; deeper model-training artifacts are still a later phase.

## 2026-03-14 — Cross-Asset Research Doctrine Integration

### What was implemented
1. Added an explicit research doctrine profile to the knowledge layer.
2. Exposed the doctrine through a dedicated assistant tool and research API endpoint.
3. Updated research-assistant prompt rules so answers follow:
- economically grounded factor logic,
- risk-first reasoning,
- honesty about runtime support boundaries,
- no reliance on retail indicators as primary factor logic.
4. Added canonical doctrine documentation:
- `docs/QUANT_RESEARCH_DOCTRINE.md`

### Files changed
- `src/server/research/knowledge.ts`
- `src/server/research/tools.ts`
- `src/server/chat/tools.ts`
- `src/server/chat/prompts.ts`
- `src/server/api/app.ts`
- `docs/QUANT_RESEARCH_DOCTRINE.md`
- `docs/RESEARCH_ASSISTANT_TOOLS.md`
- `README.md`
- `docs/PROJECT_MEMORY.md`

### Verification
- `npm run typecheck` ✅
- targeted research-tool tests ✅

### Open issues
- Doctrine now constrains assistant and research tooling, but does not magically imply commodity futures runtime support.
- Commodity futures remain a target research scope, not a falsely claimed live product capability.

## 2026-03-14 — Canonical Assistant + Reproducibility Upgrade

### What was implemented
1. Unified AI entrypoints
- `src/components/AiPage.jsx` now uses the backend canonical assistant.
- `src/components/ChatAssistant.jsx` now uses the same assistant hook/path instead of separate logic.
- New shared frontend hook: `src/hooks/useNovaAssistant.js`.

2. Canonical Nova Assistant backend
- `src/server/chat/service.ts` now owns:
  - thread creation/restoration,
  - recent-message memory,
  - provider-chain execution,
  - deterministic fallback,
  - message persistence.
- Added thread/message persistence via SQLite.

3. Assistant tool/prompt improvements
- `src/server/chat/tools.ts` now produces:
  - relevance-filtered signal cards,
  - deterministic retrieval guidance,
  - selected evidence lines,
  - status summary.
- `src/server/chat/prompts.ts` now assembles sectioned prompts instead of raw JSON dumping.

4. API surface changes
- `/api/chat` accepts optional `threadId`.
- Added:
  - `GET /api/chat/threads`
  - `GET /api/chat/threads/:id`

5. Reproducibility and handoff
- Added scripts:
  - `clean`
  - `lint`
  - `test`
  - `verify`
- Added:
  - `.npmignore`
  - `.gitattributes`
  - `scripts/check-repo-policy.mjs`
  - `scripts/clean-worktree.mjs`
  - `scripts/verify.mjs`
- `vite.config.js` now excludes `artifacts/` and `node_modules/` from test discovery.

### Files changed
- `src/server/chat/service.ts`
- `src/server/chat/tools.ts`
- `src/server/chat/prompts.ts`
- `src/server/chat/types.ts`
- `src/server/chat/providers/errors.ts`
- `src/server/chat/audit.ts`
- `src/server/api/app.ts`
- `src/server/db/schema.ts`
- `src/server/db/repository.ts`
- `src/server/types.ts`
- `src/components/AiPage.jsx`
- `src/components/ChatAssistant.jsx`
- `src/hooks/useNovaAssistant.js`
- `src/App.jsx`
- `package.json`
- `vite.config.js`
- `README.md`
- `docs/SYSTEM_ARCHITECTURE.md`
- `docs/TECHNICAL_DUE_DILIGENCE_GUIDE.md`
- `docs/NOVA_ASSISTANT_ARCHITECTURE.md`

### Verification
- `npm ci` ✅
- `npm run typecheck` ✅
- `npm test` ✅
- `npm run build` ✅
- `npm run verify` ✅
- final handoff state cleaned with `npm run clean` ✅

### Open issues
- Assistant still uses prompt-based provider orchestration, not formal JSON tool-call schemas.
- Frontend UI now uses one canonical assistant path, but deeper AI UX polish can continue later.
- Production build still emits a chunk-size warning (`~502 kB` main bundle) and would benefit from deliberate code splitting.

## 2026-03-07 — Context Recovery + Architecture Alignment

### Scope
- Recovered architectural constitution from `docs/quant_ai_pack/`.
- Aligned project memory and execution roadmap with approved priorities.

### Files/Areas Reviewed
- `docs/quant_ai_pack/*.md` (all files)
- `src/engines/*`
- `src/components/*` (Today/Insights/Safety/Performance/AI)
- `src/server/chat/*`
- `src/server/api/*`

### Key Decisions Confirmed
1. Keep consumer layer simple; move complexity to diagnostics/evidence.
2. Implement signal funnel transparency before expanding feature complexity.
3. Maintain non-custodial, advice-first posture.
4. Enforce structured AI copilot output contract.

### Unresolved at this stage
- Step 1 code implementation pending in this log block (to be appended below after coding).

---

## 2026-03-07 — Step 1 Implemented: Signal Funnel + Diagnostics

### What was implemented
1. Added canonical funnel diagnostics engine:
- New module: `src/engines/funnelEngine.js`
- Computes:
  - universe_size
  - universe_after_liquidity_filter
  - raw_signals_generated
  - filtered_by_regime
  - filtered_by_risk
  - filtered_by_conflict
  - executable_opportunities
  - filled_trades
  - completed_round_trip_trades
- Adds No-Trade Top N taxonomy counts.
- Adds Shadow Opportunity Log with near-miss diagnostics and synthetic forward path stats.

2. Integrated funnel diagnostics into pipeline:
- `src/engines/pipeline.js`
- Emits `analytics.signal_funnel` as source-of-truth diagnostics object.

3. Wired diagnostics to Today page:
- `src/App.jsx`: passes `analytics` into Signals tab.
- `src/components/SignalsTab.jsx`:
  - consumes engine diagnostics,
  - displays full funnel stages,
  - shows No-Trade Top N,
  - shows Shadow Opportunity Log list.

4. Supporting updates:
- `src/styles.css`: shadow log UI styles and grid tweaks.
- `src/i18n.js`: added funnel/shadow labels (EN/ZH).

### Files changed in this block
- `src/engines/funnelEngine.js` (new)
- `src/engines/pipeline.js`
- `src/App.jsx`
- `src/components/SignalsTab.jsx`
- `src/styles.css`
- `src/i18n.js`

### Architectural decisions
1. Diagnostics lives in engine layer, not UI.
2. UI acts as renderer of auditable pipeline outputs.
3. Reason taxonomy follows `quant_ai_pack` naming baseline.
4. Added fallback diagnostics in UI only when `analytics.signal_funnel` is absent (backward compatibility).

### Verification
- Build pass: `npm run build` succeeded after integration.
- Pipeline smoke check (local script):
  - diagnostics object generated,
  - no-trade top reasons populated,
  - shadow opportunity log populated.

### Unresolved / follow-up from Step 1
1. `universe_after_liquidity_filter` currently equals universe (no true liquidity gate yet).
2. Shadow forward-path uses deterministic synthetic proxy (not true future bars yet).
3. No-trade reasons are currently inferred at signal snapshot level; order-level granularity can be deepened later.

---

## 2026-03-07 — Step 2 (Foundation Pass): Risk Guardrails

### What was implemented
1. Added portfolio risk guardrail engine:
- New module: `src/engines/riskGuardrailEngine.js`
- Outputs:
  - user risk bucket
  - portfolio risk budget (used/max/remaining)
  - correlated exposure alerts
  - regime mismatch warnings
  - stay-out / reduce / trade-ok recommendation
  - per-signal warning annotations

2. Integrated guardrails into pipeline and signals:
- `src/engines/pipeline.js`
  - runs guardrail engine after signal generation
  - annotates signals with `risk_warnings` and `guardrail_recommendation`
  - exposes `analytics.risk_guardrails`
  - stores guardrail snapshot under `config.risk_guardrails`

3. Wired guardrails into product surfaces:
- `src/components/SignalsTab.jsx`
  - posture decision now consumes guardrail recommendation when available
  - risk summary includes correlation/regime-mismatch warnings
- `src/components/SignalCard.jsx`
  - card-level warning chips for regime mismatch / correlation cluster
- `src/components/RiskTab.jsx`
  - shows portfolio risk budget and system recommendation

### Files changed in this block
- `src/engines/riskGuardrailEngine.js` (new)
- `src/engines/pipeline.js`
- `src/components/SignalsTab.jsx`
- `src/components/SignalCard.jsx`
- `src/components/RiskTab.jsx`

### Key decisions
1. Risk recommendation hierarchy:
- `STAY_OUT` only for hard risk states
- `REDUCE` for elevated but manageable risk
- `TRADE_OK` for normal disciplined mode
2. Correlation exposure alerts are theme-based for now (lightweight, auditable).
3. Signal-level warnings are additive metadata, not hard blockers.

### Verification
- Build pass after integration: `npm run build`.
- Local pipeline smoke checks confirm guardrail object is generated and consumed.

### Remaining work after this foundation pass
1. Correlation model should move from heuristic theme buckets to return-based exposure matrix.
2. Portfolio budget should include open position state from execution records, not only signal snapshot approximation.
3. Regime mismatch warnings should link directly to activation policy tables.

---

## 2026-03-08 — Research Core Professionalization Pass (Review-Ready Upgrade)

### Scope
Implemented a foundational research core upgrade to make the repository externally reviewable by investors/technical due diligence.

### What was added

1. Research core v2 modules (new)
- `src/research/core/strategyFamilies.js`
- `src/research/core/regimeEngineV2.js`
- `src/research/core/riskBucketSystem.js`
- `src/research/core/signalFunnelDiagnosticsV2.js`
- `src/research/core/shadowOpportunityLog.js`
- `src/research/core/walkForwardValidation.js`
- `src/research/core/strategyGovernanceV2.js`
- `src/research/core/researchCoreUpgrade.js`
- `src/research/core/index.js`

2. Pipeline integration
- `src/engines/pipeline.js`
- Adds `research.research_core` object with:
  - strategy family registry
  - regime engine output
  - risk bucket decisions
  - signal funnel diagnostics
  - shadow opportunity log
  - walk-forward validation
  - lifecycle governance decisions
- Adds research-core summary in `analytics.research`.

3. Repository structure clarity (review IA)
- Added top-level layer entrypoints/docs:
  - `ui/README.md`
  - `api/README.md`
  - `data/README.md`
  - `strategies/README.md`, `strategies/index.js`
  - `regime/README.md`, `regime/index.js`
  - `risk/README.md`, `risk/index.js`
  - `diagnostics/README.md`, `diagnostics/index.js`
  - `backtest/README.md`, `backtest/index.js`
  - `copilot/README.md`, `copilot/index.js`
  - `tests/README.md`

4. Documentation refresh
- Rewrote root `README.md`.
- Added required docs:
  - `docs/SYSTEM_ARCHITECTURE.md`
  - `docs/DATA_CONTRACTS.md`
  - `docs/STRATEGY_REGISTRY.md`
  - `docs/ASSUMPTIONS.md`
  - `docs/SIGNAL_FUNNEL.md`
- Updated project memory and research logs.

### Architectural decisions

1. Preserve existing runtime behavior
- No hard replacement of existing `buildNovaQuantSystem` or governance stack.
- New research core is additive and attached to pipeline outputs.

2. Keep modules inspectable and auditable
- Each pillar is a dedicated module with explicit inputs/outputs.
- No hidden stateful logic; object-level explainability retained.

3. Separate review IA from runtime placement
- Runtime remains in `src/` to avoid breaking app flow.
- Top-level layer folders provide due-diligence readability.

4. Explicit maturity labeling
- Added component status labeling (`DEMO` / `MOCK_DATA` / `EXPERIMENTAL` / `PRODUCTION_INTENDED`).

### Open issues

1. Backtest realism
- Current backtest distribution still shows signs of synthetic pathology and needs correction before performance claims.

2. Shadow log truth path
- Forward outcome path is still synthetic proxy and should be replaced with bar-joined realized outcomes.

---

## 2026-03-09 — Runtime Authenticity + Technical DD Cleanup

### Scope
Upgraded runtime from mock/synthetic-first behavior to DB/API/derived-state-first behavior with honest degrade semantics.

### Key implementation blocks

1. **Derived runtime state**
- Added `src/server/quant/runtimeDerivation.ts` integration in quant sync path.
- Runtime now derives:
  - `market_state` from OHLCV features/regime rules,
  - signals from deterministic bar-driven rules,
  - performance snapshots from execution records,
  - freshness + coverage summaries.

2. **Quant service path hardening**
- `src/server/quant/service.ts` `ensureQuantData(...)` switched to derived runtime flow.
- Removed quant sync dependence on runtime mock files.

3. **API unification and runtime endpoints**
- Added `/api/runtime-state` and `/api/executions` GET.
- Added `/api/risk-profile` POST to persist user profile presets.
- Runtime API responses now include source/data transparency metadata.

4. **Chat runtime de-mock**
- Rebuilt `src/server/chat/tools.ts` to use shared query/runtime functions.
- Removed runtime fallback to `public/mock/*`.
- Added source transparency context fields for prompt layer.

5. **Connector honesty mode**
- Replaced fake adapter snapshots with disconnected null-state defaults in `src/server/connect/adapters.ts`.
- API connect endpoints now persist status checks into `external_connections`.

6. **Frontend API-first migration**
- `src/App.jsx` now fetches `/api/runtime-state` + supporting `/api/*` endpoints by default.
- Local `runQuantPipeline` remains only in explicit demo mode (`VITE_DEMO_MODE=1`).
- Paper execution actions now POST to `/api/executions` in runtime mode.

7. **Ingestion reproducibility improvement**
- `src/server/ingestion/stooq.ts` now supports symbol whitelist.
- `src/server/jobs/backfill.ts` passes configured US symbols to avoid unbounded default ingestion scope.

8. **Run scripts and package hygiene**
- Added `scripts/derive-runtime-state.ts`.
- Added `npm run derive:runtime`.
- Renamed package to `nova-quant`.
- Expanded `.gitignore` for DD hygiene.

9. **Route wrapper convergence**
- `api/assets.ts`, `api/ohlcv.ts`, `api/chat.ts`, `api/ai-chat.ts` now delegate to `createApiApp()`.

10. **Tests added/updated**
- Added:
  - `tests/runtimeDerivation.test.ts`
  - `tests/connectAdapters.test.ts`
  - `tests/chatToolsRuntime.test.ts`
  - `tests/apiRuntimeState.test.ts`
- Updated:
  - `tests/pipelineSmoke.test.ts` (`MOCK_DATA` -> `MODEL_DERIVED`)
- Result:
  - `npm run test:data` passes (56/56).
  - `npm run typecheck` passes.
  - `npm run build` passes.

3. Governance human-in-the-loop
- Lifecycle decisions are currently system-generated; formal reviewer workflow should be added.

4. Cost model depth
- Cost/slippage models are structured but still simplified and not venue-specific.

---

## 2026-03-08 — Major Research Core Upgrade (AI-Native Platform Hardening)

### Scope
Extended research core beyond baseline v2 into a deeper modular research platform covering:
- strategy family breadth,
- feature/signal lifecycle abstraction,
- regime confidence + transitions,
- layered risk budgets,
- richer funnel diagnostics,
- deeper shadow analysis,
- anti-overfit validation extensions,
- governance stage policy/operations,
- research automation loop,
- product-facing opportunity object quality.

### New/Updated Core Modules

1. Updated
- `src/research/core/strategyFamilies.js`
  - expanded template coverage across required families,
  - added optional future families,
  - added `validation_requirements`, `compatible_filters`, `governance_hooks`.

2. Updated
- `src/research/core/regimeEngineV2.js`
  - added regime confidence,
  - added transition history,
  - added expected trade density bands,
  - added warning severity and per-signal compatibility checks.

3. Updated
- `src/research/core/riskBucketSystem.js`
  - added market and asset-class concentration budgets,
  - added max total active risk,
  - added concurrent position budgeting,
  - improved trade decision explanations.

4. Updated
- `src/research/core/signalFunnelDiagnosticsV2.js`
  - added prefilter/pass-stage counters,
  - added by-asset-class and by-trade-day diagnostics,
  - added threshold sensitivity and over-filtering detection.

5. Updated
- `src/research/core/shadowOpportunityLog.js`
  - added strategy template/market fields,
  - added drawdown proxy profile,
  - added under-traded family/regime matrix.

6. Updated
- `src/research/core/walkForwardValidation.js`
  - added rolling reoptimization metadata,
  - added regime trade-density slices,
  - added parameter sensitivity surface,
  - added promotion readiness verdict.

7. Updated
- `src/research/core/strategyGovernanceV2.js`
  - added stage policy contracts,
  - added governance operations and version comparison,
  - enriched strategy metadata (family/template/activation).

8. New
- `src/research/core/featureSignalLayer.js`
  - formal separation of raw/scored/filtered/executable signal objects,
  - reusable feature catalog,
  - standardized product-facing opportunity objects with lineage.

9. New
- `src/research/core/researchAutomationLoop.js`
  - deterioration alerts,
  - signal starvation detection,
  - candidate strategy suggestions,
  - weekly research summary output.

10. Updated integration
- `src/research/core/researchCoreUpgrade.js`
  - wires all upgraded modules into `research.research_core` output.
- `src/research/core/index.js`
  - exports new modules.

### Tests Added

- `tests/researchAutomationLoop.test.ts`
- `tests/opportunityObjectQuality.test.ts`
- `tests/funnelDiagnosticsV2.test.ts`

### Verification

- `npm run test:data` -> pass
- `npm run typecheck` -> pass
- `npm run build` -> pass

### Open Issues (still unresolved)

1. Backtest realism remains insufficient for performance claims.
2. Shadow forward outcomes remain synthetic proxies.
3. Venue-specific cost/slippage calibration is pending.
4. Human reviewer governance workflow still lightweight.

---

## 2026-03-08 — Process Guardrail Added (Session Continuity)

### What was added
- Added mandatory handoff protocol document:
  - `docs/SESSION_HANDOFF_PROTOCOL.md`
- Linked protocol from README docs index.
- Added process non-negotiable references in:
  - `docs/PROJECT_MEMORY.md`
  - `docs/NEXT_STEPS.md`

### Why
- Ensure all future major implementation blocks leave complete resume context.
- Prevent context loss across Nova Quant sessions.

---

## 2026-03-08 — Strategy Discovery Engine (Foundational Implementation)

### Scope
Implemented the first complete Strategy Discovery Engine stack so Nova Quant can continuously generate, validate, score, and promote new strategy candidates from structured hypotheses.

### What was implemented

1. Discovery architecture modules (new)
- `src/research/discovery/hypothesisRegistry.js`
- `src/research/discovery/templateRegistry.js`
- `src/research/discovery/candidateGenerator.js`
- `src/research/discovery/candidateValidation.js`
- `src/research/discovery/candidateScoring.js`
- `src/research/discovery/discoveryDiagnostics.js`
- `src/research/discovery/strategyDiscoveryEngine.js`
- `src/research/discovery/index.js`

2. Research core integration
- Updated `src/research/core/researchCoreUpgrade.js`
  - added `strategy_discovery_engine` block to core outputs.
  - added component status label for discovery engine.
- Updated `src/research/core/researchAutomationLoop.js`
  - added `strategy_discovery_snapshot` summary.
- Updated `src/research/core/index.js`
  - exported discovery modules from core entrypoint.
- Updated `src/engines/pipeline.js`
  - surfaced discovery summary fields in `analytics.research.research_core`.

3. Candidate lifecycle mechanics
- Guided candidate generation from hypothesis-template-feature compatibility.
- Five-stage validation pipeline:
  - fast sanity,
  - quick backtest,
  - robustness,
  - walk-forward,
  - portfolio contribution.
- Candidate Quality Score and lifecycle recommendation:
  - `PROMOTE_TO_SHADOW`
  - `HOLD_FOR_RETEST`
  - `REJECT`
- Discovery decisions emitted as first-class auditable objects.

4. Diagnostics
- Added discovery diagnostics for:
  - per-hypothesis success rates,
  - by-regime coverage,
  - by-asset-class coverage,
  - recurring family failures,
  - top rejection reasons,
  - regime/asset coverage gaps.

5. Tests
- Added `tests/strategyDiscoveryEngine.test.ts`
  - validates discovery layers exist,
  - validates candidate traceability,
  - validates DRAFT->SHADOW decision path presence.

### Documentation updates
- Added `docs/STRATEGY_DISCOVERY_ENGINE.md`
- Updated `docs/DATA_CONTRACTS.md` with discovery contracts
- Updated `README.md` module and docs index

### Verification
- `npm run test:data` -> pass
- `npm run build` -> pass

### Architectural decisions
1. Avoid brute-force generation by using bounded parameter modes (`base`, `conservative`, `exploratory`, `regime_tuned`).
2. Keep discovery fully inspectable with explicit traceability per candidate.
3. Keep lifecycle decisioning separate from static strategy registry so discovery can evolve independently.
4. Keep this release simulation-first and explicitly auditable rather than claiming production execution realism.

### Open issues
1. Candidate validation metrics still use deterministic simulation proxies, not full event-level replay.
2. Portfolio contribution stage uses calibrated proxy metrics and should later integrate full portfolio simulator.
3. Reviewer workflow for discovery promotions remains `system-generated`.

### Calibration follow-up (same session)

- Tightened discovery gating to reduce over-promotion:
  - stricter validation defaults in stage 1-5,
  - stricter quality score promotion threshold (`>= 0.86` -> `PROMOTE_TO_SHADOW`),
  - stronger hold band (`0.74 - 0.8599` -> `HOLD_FOR_RETEST`).
- Snapshot after recalibration (same fixed run timestamp):
  - generated=40,
  - survivors=35,
  - promoted_to_shadow=7,
  - hold_for_retest=19,
  - rejected=14.

---

## 2026-03-08 — Research Materials Pack (Official Sources + Seed Knowledge)

### Scope
Built a complete research-materials foundation for Nova Quant so research/discovery can scale with reusable references and seed assets.

### Directories created
- `docs/research_materials/`
- `docs/research_materials/official_sources/`
- `docs/research_materials/internal_seeds/`
- `docs/research_materials/playbooks/`
- `docs/research_materials/weekly_feed/`
- `data/reference_universes/`
- `data/reference_seeds/`

### Materials created

1. Official-source docs
- `docs/research_materials/official_sources/OFFICIAL_SOURCE_DIGEST.md`
- `docs/research_materials/official_sources/DATA_SOURCE_SETUP_GUIDE.md`

2. Internal seed libraries
- `docs/research_materials/internal_seeds/HYPOTHESIS_LIBRARY.md` (100 structured hypotheses)
- `docs/research_materials/internal_seeds/STRATEGY_TEMPLATE_LIBRARY.md` (32 reusable templates)
- `docs/research_materials/internal_seeds/FEATURE_CATALOG.md`
- `docs/research_materials/internal_seeds/RESEARCH_QUESTION_LIBRARY.md` (100 practical questions)

3. Playbooks and feed templates
- `docs/research_materials/playbooks/MARKET_OBSERVATION_PLAYBOOK.md`
- `docs/research_materials/playbooks/WEEKLY_RESEARCH_FEED_TEMPLATE.md`
- `docs/research_materials/weekly_feed/WEEKLY_RESEARCH_FEED_TEMPLATE.md`

4. Universe seeds
- `data/reference_universes/us_equities_core.json` (74)
- `data/reference_universes/us_equities_extended.json` (179)
- `data/reference_universes/us_sector_etfs.json` (20)
- `data/reference_universes/crypto_core.json` (12)
- `data/reference_universes/crypto_extended.json` (25)
- `data/reference_universes/market_proxies.json` (20)

5. Discovery seed JSON
- `data/reference_seeds/hypothesis_registry_seed.json` (100)
- `data/reference_seeds/strategy_template_seed.json` (32)

6. Master index
- `docs/research_materials/RESEARCH_MATERIALS_INDEX.md`

### Validation checks
- Hypothesis seed count: 100
- Template seed count: 32
- Research-question count: 100
- Universe file counts validated against requested ranges.

### API key / access notes captured
- Polygon: key + plan entitlements required for practical usage.
- Binance/Bybit/Deribit public market endpoints: usable without key for public market data; private/trading endpoints require key.
- Framework references (Qlib/vectorbt/backtrader/zipline): no market-data keys; workflow/backtest references.

### Open issues
1. Materials are complete and usable as seeds, but not yet wired into runtime loaders.
2. Official source contract drift monitoring is still manual.
3. Universe and hypothesis quality should be tuned with live diagnostics feedback after first weekly cycles.

---

## 2026-03-08 — Due-Diligence Platform Upgrade (Evidence + Portfolio Simulation + AI Copilot)

### Scope
Upgraded Nova Quant from research-core prototype to stronger due-diligence-ready platform infrastructure by adding:
1) Research Evidence System
2) Portfolio Simulation Engine
3) AI Research Copilot
4) Weekly Research Cycle + report generation
5) Due-diligence documentation set

### New modules added

1. Research evidence
- `src/research/evidence/evidenceSystem.js`
- `src/research/evidence/index.js`
- `research/evidence/index.js`

2. Portfolio simulation
- `src/portfolio_simulation/portfolioSimulationEngine.js`
- `src/portfolio_simulation/index.js`
- `portfolio_simulation/index.js`
- `portfolio_simulation/README.md`

3. AI research copilot
- `src/research/copilot/aiResearchCopilot.js`
- `src/research/copilot/index.js`
- `research/copilot/index.js`

4. Weekly cycle
- `src/research/weekly_cycle/weeklyResearchCycle.js`
- `src/research/weekly_cycle/writeWeeklyReportNode.js`
- `src/research/weekly_cycle/index.js`
- `research/weekly_cycle/index.js`

5. Review-layer grouping
- `research/README.md`

### Core integration updates
- Updated `src/research/core/researchCoreUpgrade.js`
  - wired in evidence system, portfolio simulation, AI copilot, weekly cycle
  - extended component status map
- Updated `src/research/core/researchAutomationLoop.js`
  - added AI copilot snapshot and weekly cycle snapshot
- Updated `src/research/core/index.js`
  - exported new modules
- Updated `src/engines/pipeline.js`
  - surfaced new analytics summary fields for evidence quality, portfolio metrics, copilot insights, weekly recommendations

### Report artifact
- Generated:
  - `docs/research_reports/WEEKLY_RESEARCH_REPORT.md`

### New tests added
- `tests/researchEvidenceSystem.test.ts`
- `tests/portfolioSimulationEngine.test.ts`
- `tests/aiResearchCopilot.test.ts`
- `tests/weeklyResearchCycle.test.ts`

### Documentation added
- `docs/RESEARCH_EVIDENCE_SYSTEM.md`
- `docs/PORTFOLIO_SIMULATION_ENGINE.md`
- `docs/AI_RESEARCH_COPILOT.md`
- `docs/TECHNICAL_DUE_DILIGENCE_GUIDE.md`
- `docs/REPOSITORY_OVERVIEW.md`

### Existing docs updated
- `README.md`
- `docs/SYSTEM_ARCHITECTURE.md`
- `docs/DATA_CONTRACTS.md`

### Verification
- `npm run test:data` -> pass (17 files, 30 tests)
- `npm run build` -> pass

### Architectural notes
1. Evidence chain is now first-class and includes promotion history + governance lineage.
2. Portfolio simulation is integrated and outputs exposure + diversification + marginal impact diagnostics.
3. AI copilot now uses diagnostics to produce evidence-referenced research actions.
4. Weekly cycle generates structured report-ready summaries.
5. File write path for weekly report is isolated in Node-only module to avoid browser bundling issues.

### Remaining gaps
1. Portfolio simulation and parts of validation remain simulation-proxy based.
2. Weekly report is generated from current-cycle objects; historical report persistence workflow remains lightweight.
3. Human reviewer sign-off pipeline still not fully formalized in governance operations.

---

## 2026-03-08 — Advanced Research Knowledge Pack Ingestion

### Scope
Built a full advanced knowledge pack so Nova Quant can enforce higher-order research standards across discovery, validation, portfolio simulation, governance, and weekly ops.

### New docs created

1. Pack index and synthesis
- `docs/advanced_research_pack/ADVANCED_RESEARCH_INDEX.md`
- `docs/advanced_research_pack/ADVANCED_KNOWLEDGE_SYNTHESIS.md`

2. Methodology doctrine
- `docs/advanced_research_pack/methodology/ALPHA_RESEARCH_METHODOLOGY.md`
- `docs/advanced_research_pack/methodology/RESEARCH_DOCTRINE.md`

3. Portfolio intelligence
- `docs/advanced_research_pack/portfolio/PORTFOLIO_CONSTRUCTION_THEORY.md`
- `docs/advanced_research_pack/portfolio/PORTFOLIO_EVALUATION_FRAMEWORK.md`

4. Validation doctrine
- `docs/advanced_research_pack/validation/VALIDATION_DOCTRINE.md`
- `docs/advanced_research_pack/validation/ANTI_OVERFITTING_PATTERNS.md`
- `docs/advanced_research_pack/validation/STRATEGY_DECAY_AND_REGIME_DRIFT.md`

5. Failure modes
- `docs/advanced_research_pack/failure_modes/QUANT_FAILURE_MODES.md`
- `docs/advanced_research_pack/failure_modes/PRODUCT_FAILURE_MODES.md`

6. Governance standards
- `docs/advanced_research_pack/governance/RESEARCH_GOVERNANCE_STANDARDS.md`
- `docs/advanced_research_pack/governance/STRATEGY_AUDIT_CHECKLIST.md`

7. Research operations
- `docs/advanced_research_pack/research_ops/WEEKLY_RESEARCH_OPERATING_SYSTEM.md`
- `docs/advanced_research_pack/research_ops/MONTHLY_GROWTH_REVIEW.md`

### New machine-readable policy seeds
- `data/reference_seeds/research_doctrine_seed.json`
- `data/reference_seeds/failure_mode_seed.json`
- `data/reference_seeds/portfolio_evaluation_seed.json`
- `data/reference_seeds/governance_checklist_seed.json`

### Architectural decisions
1. Kept this phase focused on doctrine/standards ingestion, not net-new strategy features.
2. Mapped every advanced doc to concrete consuming modules (discovery, validation, governance, portfolio simulation, weekly cycle, copilot).
3. Added structured seed JSON so policy logic can be consumed programmatically in next implementation phase.
4. Preserved current architecture and naming taxonomy to avoid migration drift.

### Open issues after ingestion
1. Seed-driven enforcement is not yet wired into runtime constructors.
2. Governance checklist scoring is documented but not yet executed in code.
3. Portfolio evaluation and failure-mode seeds are not yet integrated into weekly copilot ranking.

---

## 2026-03-08 — Global System Review Package (External Senior Reviewer Ready)

### Scope
Created a complete 12-file global audit package under `docs/global_review/` to document current system maturity, strengths, weaknesses, and next-phase priorities.

### Files created
- `docs/global_review/01_EXECUTIVE_SUMMARY.md`
- `docs/global_review/02_SYSTEM_ARCHITECTURE_STATUS.md`
- `docs/global_review/03_MODULE_STATUS_MATRIX.md`
- `docs/global_review/04_RESEARCH_CORE_STATUS.md`
- `docs/global_review/05_DISCOVERY_ENGINE_STATUS.md`
- `docs/global_review/06_VALIDATION_DIAGNOSTICS_STATUS.md`
- `docs/global_review/07_RISK_GOVERNANCE_STATUS.md`
- `docs/global_review/08_PORTFOLIO_INTELLIGENCE_STATUS.md`
- `docs/global_review/09_PRODUCT_DECISION_LAYER_STATUS.md`
- `docs/global_review/10_ENGINEERING_DD_STATUS.md`
- `docs/global_review/11_LIMITATIONS_AND_GAPS.md`
- `docs/global_review/12_NEXT_PHASE_PRIORITIES.md`

### Verification snapshot used in review
- `npm run test:data` -> pass (17 files, 30 tests)
- `npm run build` -> pass
- Build note: frontend chunk-size warning still present.

### Core conclusions recorded
1. Architecture maturity is now coherent and reviewable end-to-end.
2. Decision object quality and explainability are strong for early stage.
3. Major realism gaps remain in validation/shadow/portfolio simulation paths.
4. Governance process is codified in code, but human sign-off rigor is still limited.

---

## 2026-03-09 — Historical Replay Validation (Credibility Priority)

### Scope
Replaced key synthetic validation paths with historical bar replay where feasible, and connected replay outputs to validation/evidence/diagnostics.

### New module
- `src/research/validation/historicalReplayValidation.js` (new)

### What was implemented

1. Replay engine capabilities
- event-ordered lifecycle replay:
  - signal formation
  - signal filtering
  - entry-zone trigger checks
  - stop/take-profit/expiry exit checks
- explicit assumptions:
  - entry fill model
  - exit fill model
  - intrabar priority (`stop_first` default)
  - market-specific slippage and fee presets
- outputs:
  - replayed signal records
  - signal outcome map
  - daily aggregate replay series
  - market/family/strategy replay benchmarks

2. Walk-forward integration
- Updated `src/research/core/walkForwardValidation.js`
  - now builds `replay_validation`
  - strategy results include `replay_context`
  - champion can use replay-backed daily series
  - summary includes replay coverage stats
- Validator version bumped to `walk-forward.v2`.

3. Core wiring updates
- Updated `src/research/core/researchCoreUpgrade.js`
  - walk-forward now receives championState/regime/risk/funnel context
  - shadow diagnostics now consume walk-forward replay outputs

4. Shadow realism upgrade
- Updated `src/research/core/shadowOpportunityLog.js`
  - replay forward path integration via `replayValidation.signal_outcome_map`
  - synthetic path retained only as fallback
  - each record now labels `forward_path_source`

5. Discovery realism upgrade
- Updated `src/research/discovery/strategyDiscoveryEngine.js`
  - passes walk-forward context into candidate validation
- Updated `src/research/discovery/candidateValidation.js`
  - quick-backtest stage can anchor to replay market benchmarks
  - metrics include replay-anchor metadata
  - validator version bumped to `discovery-candidate-validation.v2`

6. Evidence-chain integration
- Updated `src/research/evidence/evidenceSystem.js`
  - walk-forward replay context now passes into evidence objects
  - evidence summary includes replay validation summary

7. Entrypoint/export updates
- Updated `backtest/index.js`
- Updated `src/research/core/index.js`

8. Docs added/updated
- Added `docs/REAL_REPLAY_VALIDATION.md`
- Added `docs/VALIDATION_REALISM_GAP_ANALYSIS.md`
- Updated `docs/ASSUMPTIONS.md`
- Updated `docs/SYSTEM_ARCHITECTURE.md`
- Updated `README.md` docs index

9. Tests
- Added `tests/historicalReplayValidation.test.ts`
- Updated `tests/pipelineSmoke.test.ts` to assert replay output exists

### Verification
- `npm run test:data` -> pass (18 files, 32 tests)
- `npm run build` -> pass

### Realism outcomes
- Synthetic-only shadow forward path replaced by replay-first path.
- Walk-forward now includes real replay stream for champion-level validation context.
- Candidate quick-stage evaluation no longer purely hash-driven when replay benchmarks are available.

### Remaining realism gaps
1. Tick-level execution and queue priority not modeled.
2. Intrabar ordering is assumption-based.
3. Dynamic slippage/liquidity regime model still pending.
4. Challenger replay mapping still partial (legacy backtest remains for challengers).
5. Options microstructure replay still shallow.

---

## 2026-03-09 — Execution Realism Hardening (Credibility Priority #2)

### Scope
Hardened execution realism across replay, validation, discovery, portfolio simulation, evidence, and governance summaries.

### New module
- `src/research/validation/executionRealismModel.js` (new)

### Core implementation
1. Structured execution realism profiles
- Added profile-based assumptions for:
  - `replay`
  - `backtest`
  - `paper`
- Each profile now defines:
  - fee schedule,
  - slippage schedule by volatility bucket,
  - spread schedule by volatility bucket,
  - funding drag (crypto),
  - fill-policy defaults.

2. Explicit fill-policy framework
- Supported policies:
  - `touch_based`
  - `bar_cross_based`
  - `conservative_fill`
  - `optimistic_fill` (test-only)
- Replay now uses policy-aware entry checks and price references.

3. Replay realism upgrades
- Updated `src/research/validation/historicalReplayValidation.js`:
  - replay version -> `historical-replay.v2`
  - assumptions now include `assumption_profile`
  - each replayed signal now records:
    - profile/mode/scenario
    - spread/funding assumptions
    - realism notes
  - added `execution_sensitivity` scenarios:
    - `slippage_plus_25`
    - `slippage_plus_50`
    - `wider_spread`
    - `adverse_funding`
    - `strict_fill`

4. Walk-forward realism upgrades
- Updated `src/research/core/walkForwardValidation.js`:
  - integrates execution realism profile object
  - scenario-based stress replaces scalar synthetic shocks
  - adds `execution_realism` block per strategy
  - adds verdict: `survives_after_harsh_execution`
  - summary now reports `harsh_execution_survivors`

5. Discovery validation upgrades
- Updated `src/research/discovery/candidateValidation.js`:
  - quick stage now uses profile-based cost drag (fee/slippage/spread/funding)
  - robustness stage now includes scenario-based cost stress outputs
  - validator version -> `discovery-candidate-validation.v3`
- Updated `src/research/discovery/strategyDiscoveryEngine.js`:
  - passes walk-forward execution profile into candidate validation stage config.

6. Portfolio simulation upgrades
- Updated `src/portfolio_simulation/portfolioSimulationEngine.js`:
  - applies baseline execution cost drag to strategy expected returns
  - adds portfolio-level execution scenario diagnostics
  - simulator version -> `portfolio-simulation-engine.v2`
- Updated `src/research/core/researchCoreUpgrade.js`:
  - wires execution profile into portfolio simulation.

7. Evidence + governance upgrades
- Updated `src/research/evidence/evidenceSystem.js`:
  - evidence objects now carry:
    - `assumption_profile`
    - `cost_realism_notes`
    - `fill_realism_notes`
    - `funding_realism_notes`
- Updated `src/research/core/strategyGovernanceV2.js`:
  - confidence scoring now includes harsh-execution survival signal
  - governance metadata now surfaces execution realism profile status.

### Documentation added/updated
- Added:
  - `docs/EXECUTION_REALISM_MODEL.md`
  - `docs/COST_AND_FILL_SENSITIVITY.md`
- Updated:
  - `docs/ASSUMPTIONS.md`
  - `docs/REAL_REPLAY_VALIDATION.md`
  - `docs/VALIDATION_REALISM_GAP_ANALYSIS.md`
  - `README.md`

### Tests
- Added:
  - `tests/executionRealismModel.test.ts`
- Updated:
  - `tests/historicalReplayValidation.test.ts`
  - `tests/portfolioSimulationEngine.test.ts`
  - `tests/researchEvidenceSystem.test.ts`

### Verification
- `npm run test:data` -> pass (19 files, 35 tests)
- `npm run build` -> pass

### Remaining realism gaps
1. Tick/order-book/queue-level execution is still not modeled.
2. Assumptions are profile-driven but not yet calibrated from venue-level realized execution history.
3. Portfolio path is still deterministic proxy and not full replay-driven trade-path aggregation.

---

## 2026-03-09 — Governance Workflow Hardening (Institutional Rigor Upgrade)

### Scope
Upgraded strategy governance from heuristic lifecycle labeling to enforceable workflow checks, typed decision objects, and structured review records.

### Core module upgraded
- `src/research/core/strategyGovernanceV2.js` (rewritten)

### What is now enforced
1. Lifecycle standardized to:
- `DRAFT -> SHADOW -> CANARY -> PROD -> RETIRED`

2. Stage workflow contract per state now includes:
- explicit requirements
- evidence thresholds
- validation criteria
- monitoring requirements
- promotion/demotion conditions

3. Required checks are computed per strategy version:
- evidence completeness
- replay/execution-profile presence
- signal frequency
- OOS/cost/harsh-execution survival
- stability
- confidence threshold
- critical concern gate

4. Decision logic is now gate-based rather than purely heuristic confidence:
- `PROMOTE`
- `DEMOTE`
- `ROLLBACK`
- `RETIRE`
- `HOLD`

### Typed decision objects implemented
- `PromotionDecision`
- `DemotionDecision`
- `RollbackDecision`
- `RetirementDecision`

Output path:
- `research_core.strategy_governance.decision_objects`

### Review workflow implemented
Per-strategy review records now include:
- reviewer
- review timestamp
- decision rationale
- evidence links
- unresolved concerns
- approval state (`APPROVED`, `REJECTED`, `CONDITIONAL`, `PENDING`)

Output path:
- `research_core.strategy_governance.review_workflow.reviews`

### Strategy version governance records
Per strategy version now tracks:
- strategy_id / family / template / version
- evidence summary
- validation summary
- approval state and review status
- promotion history / demotion history / rollback history
- retirement reason (if retired)

Output path:
- `research_core.strategy_governance.strategy_records`

### Strategy registry visibility upgrade
Pipeline now enriches registry rows with governance readiness:
- `current_state`
- `evidence_status`
- `validation_status`
- `review_status`
- `next_eligible_action`
- `next_eligible_state`

Updated file:
- `src/engines/pipeline.js`

### Documentation added
- `docs/GOVERNANCE_WORKFLOW.md`
- `docs/STRATEGY_PROMOTION_CRITERIA.md`
- `docs/STRATEGY_REVIEW_MEMO_TEMPLATE.md`

### Documentation updated
- `docs/STRATEGY_REGISTRY.md`
- `docs/DATA_CONTRACTS.md`
- `docs/RESEARCH_EVIDENCE_SYSTEM.md`
- `README.md`

### Tests
- Added: `tests/strategyGovernanceWorkflow.test.ts`
- Updated test suite pass:
  - `npm run test:data` -> pass (20 files, 38 tests)
  - `npm run build` -> pass

---

## 2026-03-09 — Discovery Engine Runtime Operationalization (Seed-Driven Upgrade)

### Scope
Operationalized strategy discovery so runtime generation depends on seed assets instead of primarily hard-coded registries.

### Core modules added/updated
- Added: `src/research/discovery/seedRuntime.js`
- Rebuilt: `src/research/discovery/hypothesisRegistry.js`
- Rebuilt: `src/research/discovery/templateRegistry.js`
- Rebuilt: `src/research/discovery/candidateGenerator.js`
- Updated: `src/research/discovery/strategyDiscoveryEngine.js`
- Updated: `src/research/discovery/discoveryDiagnostics.js`
- Updated: `src/research/discovery/index.js`
- Updated: `src/research/core/researchCoreUpgrade.js`
- Updated: `src/engines/pipeline.js`

### Seed runtime now consumed
Runtime loader now ingests and normalizes:
- `data/reference_seeds/hypothesis_registry_seed.json`
- `data/reference_seeds/strategy_template_seed.json`
- `data/reference_seeds/feature_catalog_seed.json`
- `data/reference_seeds/research_doctrine_seed.json`
- `data/reference_seeds/governance_checklist_seed.json`

### Functional upgrades
1. Hypothesis/template registries now support runtime constraints:
- market
- asset class
- regime
- family
- trade horizon
- risk profile

2. Candidate generation now enforces:
- hypothesis -> template hint matching
- template -> feature catalog alignment
- bounded generation by discovery batch size

3. Candidate objects now carry stronger lineage:
- `required_features`
- `required_feature_groups`
- `candidate_source_metadata` (seed ids, doctrine/checklist versions, source lineage, mapping quality, constraints)

4. Discovery diagnostics now report seed utilization:
- hypotheses producing candidates
- templates used most
- unused hypotheses/templates
- mapping failures and counters

5. Pipeline now accepts discovery runtime config:
- `runQuantPipeline({ config: { discovery: { generation: ... }}})`

### Documentation added
- `docs/DISCOVERY_ENGINE_RUNTIME.md`
- `docs/SEED_TO_CANDIDATE_FLOW.md`

### Tests
- Updated: `tests/strategyDiscoveryEngine.test.ts` (added seed-usage and constrained-run assertions)
- Verification:
  - `npm run test:data -- tests/strategyDiscoveryEngine.test.ts` -> pass (1 file, 5 tests)
  - `npm run test:data -- tests/strategyDiscoveryEngine.test.ts tests/pipelineSmoke.test.ts` -> pass (2 files, 5 tests)

### Open gaps after this block
1. Doctrine/checklist seeds are loaded and attached but not yet fully enforced as hard policy gates.
2. Candidate validation realism remains a separate bottleneck from discovery generation quality.

---

## 2026-03-09 — Reliability Hardening (Testing + Stress Framework)

### Scope
Implemented deterministic reliability and adversarial stress testing to move from “module presence checks” to failure-oriented validation.

### Added modules and assets
1. Scenario pack seed:
- `data/reference_seeds/reliability_scenario_pack.json`

2. Runtime scenario pack loader:
- `src/research/reliability/scenarioPacks.js`

3. Stress framework runner:
- `src/research/reliability/reliabilityStressFramework.js`

4. Reliability script:
- `scripts/run-reliability-stress.mjs`
- `package.json` script:
  - `stress:reliability`

### Added tests
1. `tests/reliabilityStressFramework.test.ts`
- verifies scenario pack loading,
- verifies full stress suite output and summary structure,
- verifies starvation/crowding/poor-fill scenario outcomes are inspectable.

2. `tests/reliabilityCoverage.test.ts`
- expands A-I reliability categories:
  - signal correctness,
  - regime behavior,
  - risk filtering under concentration,
  - discovery/validation/governance/portfolio stress inspectability,
  - decision object completeness,
  - logging/traceability presence.

### Stress scenarios implemented
1. elevated volatility
2. risk-off regime
3. concentrated exposure
4. high slippage
5. poor fills
6. strategy starvation
7. strategy crowding / fake diversification
8. degraded candidate quality

### Generated report
- `docs/research_reports/RELIABILITY_STRESS_REPORT.json`

### Documentation added
- `docs/TESTING_AND_STRESS_FRAMEWORK.md`
- `docs/SCENARIO_PACKS.md`

### Verification
- targeted:
  - `npm run test:data -- tests/reliabilityStressFramework.test.ts tests/reliabilityCoverage.test.ts` -> pass
- full:
  - `npm run test:data` -> pass
  - `npm run build` -> pass
- stress run:
  - `npm run stress:reliability` -> report written

### Findings from this block
1. Guardrail and posture modules degrade gracefully under volatility/risk-off/concentration stress.
2. Poor-fill stress reveals realism inconsistency (`strict_fill` monotonicity issue) in validation behavior.
3. Portfolio crowding scenario reveals fake-diversification vulnerability (high correlation despite spread of strategies).
4. Governance currently remains operational but lacks stronger demotion/rollback depth under adverse execution stress.

---

## 2026-03-09 — A-minus Upgrade + Final Re-evaluation

### Scope
- Completed layer hardening focused on credibility blockers discovered during reliability and final-review prep.
- Produced new final review package with explicit ratings and skepticism points.

### Code Changes

1. Validation consistency patch
- File: `src/research/core/walkForwardValidation.js`
- Added missing `safe()` helper used by strict-fill monotonicity check.
- Result: removed runtime regression that was breaking validation, governance, and downstream tests.

2. Portfolio anti-crowding hardening
- File: `src/portfolio_simulation/portfolioSimulationEngine.js`
- Added:
  - `deriveFamilyCap()`
  - `applyFamilyCrowdingGuard()`
  - family exposure before/after summaries
- Allocation now includes crowding guard diagnostics and uses guarded strategy weights.
- Capital allocation rule updated to include family-crowding enforcement.

3. Reliability stress framework alignment
- File: `src/research/reliability/reliabilityStressFramework.js`
- `poor_fills` scenario now counts governance stress responses via typed decision objects:
  - `DemotionDecision`
  - `RollbackDecision`
  - `RetirementDecision`
- `strategy_crowding_fake_diversification` scenario now validates:
  - crowding guard cap enforcement
  - correlation pressure visibility under crowded candidate sets

### Test Updates

1. Portfolio concentration guard test
- File: `tests/portfolioSimulationEngine.test.ts`
- Added assertions for:
  - guard cap presence,
  - post-guard max family exposure <= cap,
  - non-negative cash buffer.

2. Reliability stress expectation update
- File: `tests/reliabilityStressFramework.test.ts`
- Updated to reflect hardened system behavior:
  - no mandatory failure-chain assumption,
  - poor-fill scenario now expects monotonicity validity + governance action artifacts.

### Final Review Package Added
- `docs/final_review/01_FINAL_EXECUTIVE_VERDICT.md`
- `docs/final_review/02_LAYER_BY_LAYER_RATINGS.md`
- `docs/final_review/03_REMAINING_SKEPTICISM_POINTS.md`
- `docs/final_review/04_A_MINUS_READINESS_CHECKLIST.md`
- `docs/final_review/05_FINAL_NEXT_STEPS.md`

### Verification
- `npm run test:data` => pass (22 files, 49 tests).
- `npm run build` => pass.
- `npm run stress:reliability` => pass, report written:
  - `docs/research_reports/RELIABILITY_STRESS_REPORT.json`

### Key Outcome
- Architecture consistency improved and prior regression removed.
- Portfolio layer now has explicit anti-crowding enforcement.
- Reliability suite is now aligned with hardened governance and allocation logic.
- Final verdict remains honest: platform is near A- but still bounded by replay breadth and OOS survivability depth.

---

## 2026-03-09 — Credibility & Engineering Discipline Remediation

### Scope
- Focused non-feature cleanup for diligence correctness:
  - runtime cache isolation,
  - status semantics consistency,
  - clean-source packaging hygiene,
  - historical doc archive cleanup,
  - demo naming residue cleanup with compatibility migration.

### Code Changes

1. Cache isolation hardening
- File: `src/server/quant/service.ts`
- Replaced single global runtime cache with keyed cache entries:
  - key dimensions: `userId`, `riskProfileKey`, `market`, `assetClass`, `timeframe`, `universeScope`.
- Added cache entry metadata: `key`, `context`, `createdAt`, `expiresAt`, `sourceSummary`.
- Added test helpers:
  - `__resetQuantDataCacheForTests`
  - `__buildQuantCacheKeyForTests`

2. Unified status semantics
- New file: `src/server/runtimeStatus.ts`
- Standardized status constants and helper functions:
  - runtime status normalization,
  - performance source mapping,
  - component status harmonization (`source_status`, `data_status`, `source_label`).
- Integrated into:
  - `src/server/quant/runtimeDerivation.ts`
  - `src/server/api/queries.ts`
  - `src/server/connect/adapters.ts`
  - `src/server/chat/tools.ts`

3. Frontend persistence naming cleanup
- Files:
  - `src/App.jsx`
  - `src/components/AiPage.jsx`
  - `src/hooks/useLocalStorage.js`
- Migrated localStorage keys from `quant-demo-*` to `nova-quant-*`.
- Added legacy key migration flow (read old -> write new -> remove old).

4. Packaging hygiene
- Files:
  - `.gitignore`
  - `.gitattributes`
  - `scripts/package-source.mjs`
  - `package.json` (`package:source`)
- Added repeatable clean-source packaging path and exclusion policy.

5. Historical review archive
- Moved:
  - `docs/global_review/*` -> `docs/archive/global_review_2026-03-09/*`
  - `docs/final_review/*` -> `docs/archive/final_review_2026-03-09/*`
- Added stubs:
  - `docs/global_review/ARCHIVED.md`
  - `docs/final_review/ARCHIVED.md`
- Added archive policy:
  - `docs/archive/README.md`

### Tests Added / Updated
- Added:
  - `tests/cacheIsolation.test.ts`
  - `tests/runtimeStatusConsistency.test.ts`
  - `tests/localStorageMigration.test.ts`
  - `tests/packageSourceScript.test.ts`
  - `tests/docArchiveConsistency.test.ts`
- Updated:
  - `tests/connectAdapters.test.ts`
  - `tests/apiRuntimeState.test.ts`

### Documentation Updated
- `README.md`
- `docs/SYSTEM_ARCHITECTURE.md`
- `docs/TECHNICAL_DUE_DILIGENCE_GUIDE.md`
- `docs/REPO_RUNBOOK.md`
- `docs/REALISM_UPGRADE_SUMMARY.md`
- `docs/PROJECT_MEMORY.md`
- `docs/NEXT_STEPS.md`

---

## 2026-03-12 — Homepage IA Refactor: Top Signals First

### Scope
- Reordered Today homepage into a decision-first flow where signal cards are the primary above-the-fold module.
- Kept runtime/source transparency semantics and backend data paths unchanged.

### Key UI Changes
1. Today page hierarchy now:
- `Top Signals`
- `Market Regime / Runtime Summary`
- `Open Positions / Pending Executions`
- `Performance Snapshot`
- `Watchlist`
- `Chat / Research Entry`

2. Top Signals module:
- Displays top 2-3 prioritized signals (first card visually dominant).
- Adds `View All` entry to a full `Signals Hub`.
- Card fields include:
  - ticker,
  - action label,
  - conviction/confidence,
  - timeframe,
  - regime,
  - freshness,
  - thesis line,
  - entry/stop,
  - source transparency label.
- `WITHHELD` / `INSUFFICIENT_DATA` cards are shown but visually de-emphasized and marked non-actionable.

3. Signals Hub routing:
- Added `signals` section in More page.
- `Today -> View All` now opens `More -> Signals Hub` (reusing existing full signal workflow).

### Sorting Logic
- Top signal ranking now combines:
  - score + confidence,
  - freshness decay,
  - data-status penalty,
  - actionable status,
  - safety/regime penalties.
- Ensures stale/insufficient/withheld signals are not promoted to top priority unless no better alternatives exist.

### Files Updated
- `src/components/TodayTab.jsx`
- `src/App.jsx`
- `src/components/MoreTab.jsx`
- `src/styles.css`

### Validation
- `npm run build` passed.
- `npm run test:data` passed.
- `npm run typecheck` passed.

---

## 2026-03-12 — Unified Evidence Engine Upgrade

### Scope
- Upgraded backend into a single Backtest / Replay / Paper evidence chain without changing stack fundamentals.
- Preserved honesty and source-transparency semantics.

### Core Backend Changes
1. Evidence orchestration:
- Added `src/server/evidence/engine.ts`.
- Canonical run path writes one linked chain:
  - signal snapshots
  - replay results
  - portfolio equity/trades artifacts
  - stress profile comparison
  - replay-vs-paper reconciliation
  - experiment registry record

2. Schema and repository support:
- Added evidence tables in `src/server/db/schema.ts`.
- Added persistence/query methods in `src/server/db/repository.ts` for:
  - strategy/dataset/universe/feature versions
  - execution profiles
  - backtest runs/metrics/artifacts
  - signal snapshots
  - reconciliation rows
  - experiment registry

3. API surface:
- Added evidence endpoints in `src/server/api/app.ts`.
- Added shared query wrappers in `src/server/api/queries.ts`.

4. Runtime quality tweak:
- Optimized `getTopSignalEvidence` reconciliation lookup (single fetch + map), reducing repeated DB scans.
- Added canonical/experimental path hints in evidence run output for audit clarity.

### Frontend Integration (Evidence-Aware Top Signals)
- `src/App.jsx` now fetches `/api/evidence/signals/top` and stores evidence summary in app state.
- `src/components/TodayTab.jsx` merges evidence records with signal payloads and surfaces:
  - `supporting_run_id`
  - reconciliation status
  - evidence freshness/transparency.

### CLI and Runbook
- Added `scripts/run-evidence.ts`.
- Added npm script: `npm run evidence:run`.

### Documentation Updates
- Added `docs/BACKTEST_REPLAY_PAPER_EVIDENCE_ENGINE.md`.
- Updated:
  - `README.md`
  - `docs/REPO_RUNBOOK.md`
  - `docs/SYSTEM_ARCHITECTURE.md`
  - `docs/TECHNICAL_DUE_DILIGENCE_GUIDE.md`
  - `docs/RUNTIME_DATA_LINEAGE.md`
  - `docs/REALISM_UPGRADE_SUMMARY.md`

### Verification
- `npm run typecheck` passed.
- `npm run test:data` passed.
- `npm run build` passed.

---

## 2026-03-12 — Panda Strategy Kernel / Risk Bucket / Auto Learner Backend Integration

### Scope
- Integrated Panda AI core logic into Nova Quant backend runtime path.
- Kept frontend untouched (no UI component contract breakage).

### Code Changes
1. Added module:
- `src/server/quant/pandaEngine.ts`
- Implements:
  - `PandaStrategyBase`
  - `RiskBucket`
  - `PandaAutoLearner`
  - `buildPandaAdaptiveDecision(...)`

2. Integrated into runtime derivation:
- `src/server/quant/runtimeDerivation.ts`
- Added:
  - per-market execution performance history extraction
  - Panda decision + factor ranking during signal derivation
  - fallback rule mapping from Panda direction when baseline rule is absent
  - confidence merge between baseline rule and Panda output
  - adaptive risk/position tuning and risk-bucket trade gating
  - Panda diagnostics in market-state event stats

3. Signal output enrichment (backward-compatible):
- Tags now include `auto_learning:*`, `auto_risk:*`, `auto_position:*`, and top factor tags.
- Execution checklist includes top auto factors when available.

### Tests
- Added `tests/pandaEngine.test.ts`.
- Updated `tests/runtimeDerivation.test.ts` for auto-learning tag assertions.
- Full verification:
  - `npm run typecheck` passed.
  - `npm run test:data` passed (34 files / 76 tests).
  - `npm run build` passed.

## 2026-03-14 — Measured Factor Research Diagnostics + Research Tool Prioritization

### Scope
- Added first-class measured factor evaluation for OHLCV-supported factors.
- Fixed research tool selection so factor/signal-specific tools are not silently dropped from assistant context.

### Code Changes
1. Added:
- `src/server/research/factorMeasurements.ts`
  - computes factor-level measured diagnostics:
    - IC
    - rank IC
    - quantile spread
    - hit rate
    - turnover proxy
    - regime-conditioned metrics

2. Updated:
- `src/server/research/evaluation.ts`
  - factor snapshots now include measured factor report when available
  - strategy evaluation can surface factor-level cross-sectional metrics when a factor is specified
- `src/server/research/tools.ts`
  - added `getFactorMeasuredReportTool()`
  - factor-by-regime comparison now includes measured regime diagnostics when available
- `src/server/api/app.ts`
  - added `GET /api/research/factors/:id/measured`
- `src/server/chat/tools.ts`
  - replaced naive `slice(0, 8)` tool truncation with priority-based selection
  - factor and signal specific tools now win budget before generic tools

### Tests
- Added `tests/factorMeasurements.test.ts`
- Updated `tests/researchApi.test.ts`
- Updated `tests/chatToolsRuntime.test.ts`
- Verification:
  - `npm run -s typecheck` passed
  - targeted research tests passed (`5 files / 13 tests`)
  - `npm run -s build` passed
## 2026-03-15 — Copy Operating System + Version Management

1. Added a unified copy operating system:
   - brand voice constitution
   - tone matrix
   - state-to-copy selectors
   - notification/widget/assistant guardrails
   - shared English/Chinese template library
2. Wired the copy system into:
   - decision engine
   - engagement engine
   - Today surface
   - Nova Assistant prompt layer
   - demo assistant
3. Added regression coverage:
   - `tests/novaCopySystem.test.ts`
   - updated engagement tests for locale-aware copy
4. Added first-class version management:
   - single runtime version source in `src/config/version.js`
   - `scripts/version-manager.mjs`
   - `CHANGELOG.md`
   - About modal now shows version + build

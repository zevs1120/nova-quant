# Nova Quant Next Steps

Last updated: 2026-03-14

## Immediate (highest priority)

1. Assistant structured tool calling
- Move from prompt-routed tool use toward explicit schema-validated function/tool execution.
- Add assistant evaluation checks for unsupported claims and evidence citation coverage.

2. Factor-level measured evidence depth
- Persist factor-level diagnostics and by-regime results as first-class research artifacts instead of only taxonomy + latest backtest summaries.
- Add rank-IC / quantile-spread / regime-sliced factor evaluation objects.

3. Backtest realism correction
- Fix daily-return pathology and turnover realism.
- Align backtest and paper execution assumptions stage-by-stage.
- Add diagnostics for where divergence originates.

4. Shadow truth-path upgrade
- Replace synthetic forward returns with realized bar-joined outcomes.
- Add drawdown and outcome source metadata from true bars.

5. Cost/slippage calibration
- Add venue-aware slippage/fees/funding presets.
- Integrate calibration profiles into validation stress suite.

6. Governance hardening
- Add promotion memo generation per stage transition.
- Add reviewer identity and approval state.

## Near-Term

1. Expand assistant product surfaces:
- persist signal-detail ask context
- add richer Quick Ask flows from cards/details
- expose thread history in a lightweight user-visible way if product wants it later

2. Add API endpoints for research-core objects:
- regime state,
- risk budgets,
- funnel diagnostics,
- governance actions,
- product opportunity objects.

3. Persist research-core snapshots for historical audit replay.
4. Add automated threshold-tuning experiments tied to funnel starvation signals.
5. Add regime transition confusion diagnostics and retraining triggers.

## Medium-Term

1. Real adapter integration for market/event/execution data.
2. Paper execution adapter with reconciliation audit trail.
3. Governance dashboard for lifecycle movement and degradation watch.
4. Copilot evidence mode with direct references to research core objects.

## Acceptance Criteria for Next Milestone

1. Assistant responses are evidence-aware, thread-persistent, and resilient to provider failures.
2. Backtest vs paper divergence is explainable at strategy/day stage level.
3. Shadow strictness recommendations are based on realized forward outcomes.
4. Governance actions include memo + reviewer + rollback path.
5. At least one family shows stable OOS behavior under stressed assumptions.

## Process Discipline (Mandatory)

- Every major implementation block must end with log updates following:
  - `docs/PROJECT_MEMORY.md`
  - `docs/IMPLEMENTATION_LOG.md`
  - `docs/RESEARCH_LOG.md`
  - `docs/NEXT_STEPS.md`
- Full protocol: `docs/SESSION_HANDOFF_PROTOCOL.md`

## Discovery Engine Next Steps (Added 2026-03-08)

1. Replace discovery quick-backtest proxy with bar-joined replay in the same validation stages.
2. Add persistence layer for discovery runs and candidate lineage snapshots.
3. Add reviewer approval workflow for discovery promotions (`system-generated` -> reviewer-validated).
4. Integrate discovery output with governance stage transitions and shadow paper monitoring.
5. Add threshold-learning feedback from shadow outcomes into candidate generation constraints.

## Research Materials Integration Next Steps (Added 2026-03-08)

1. Add seed-loader adapters to import:
- `data/reference_universes/*.json`
- `data/reference_seeds/hypothesis_registry_seed.json`
- `data/reference_seeds/strategy_template_seed.json`

2. Add a discovery bootstrap mode:
- If no curated hypotheses/templates provided in runtime context, use seed files as default candidates.

3. Add weekly material maintenance routine:
- refresh source entitlements and key status,
- prune hypotheses with repeated reject patterns,
- promote high-yield hypothesis clusters.

4. Add source contract health check:
- endpoint availability,
- schema drift alerts,
- data freshness checks.

5. Add weekly feed artifact persistence:
- save filled weekly template outputs under `docs/research_materials/weekly_feed/history/`.

## Due-Diligence Platform Next Steps (Added 2026-03-08)

1. Evidence persistence and queryability
- Persist evidence records by cycle and add diff views for promotion history changes.

2. Portfolio simulation realism
- Replace deterministic simulation proxies with event-level replay using realized bar/feature data.
- Add scenario library for stress testing (macro shock, liquidity shock, correlation spike).

3. Copilot quality calibration
- Add precision/recall style tracking for copilot recommendations vs realized follow-up outcomes.
- Add suppression logic for repetitive low-value recommendations.

4. Weekly cycle operations
- Add report history directory and metadata index for trend analysis.
- Add auto-linking to strategy governance decisions and promotion memos.

5. Governance hardening
- Add reviewer sign-off requirement for stage transitions with evidence bundle references.

## Advanced Knowledge Pack Operationalization (Added 2026-03-08)

1. Seed-driven policy enforcement
- Load `data/reference_seeds/research_doctrine_seed.json` into discovery/validation gating.
- Load `data/reference_seeds/governance_checklist_seed.json` into promotion review scoring.

2. Validation doctrine wiring
- Convert anti-overfitting patterns into explicit rejection tags in candidate validation.
- Add regime-drift and decay triggers from `STRATEGY_DECAY_AND_REGIME_DRIFT.md` to demotion alerts.

3. Portfolio intelligence wiring
- Use `portfolio_evaluation_seed.json` to standardize marginal contribution and drawdown concentration diagnostics.
- Add regime-sliced portfolio failure flags to weekly report and copilot outputs.

4. Failure-mode intelligence wiring
- Use `failure_mode_seed.json` in weekly diagnostics ranking and copilot recommendation generation.
- Track recurring failure modes as monthly growth review inputs.

5. Governance operations
- Implement checklist pass/fail and score-band outputs for every stage transition proposal.
- Persist checklist artifacts with evidence chain references per strategy version.

## Global Review Follow-Through (Added 2026-03-08)

1. Use `docs/archive/global_review_2026-03-09/12_NEXT_PHASE_PRIORITIES.md` as historical execution baseline only.
2. For every new milestone, update canonical current-state docs (not historical review snapshots) before updating archived review artifacts.
3. Before claiming production credibility, require closure of three blockers:
- synthetic validation path replacement,
- cost/fill realism hardening,
- governance reviewer sign-off enforcement.

## Post-Replay Priorities (Added 2026-03-09)

1. Challenger replay coverage
- Build direct replay mapping for challenger variants to reduce legacy backtest dependence.

2. Execution realism upgrade
- Add dynamic slippage model using volatility/spread/liquidity state instead of static market presets.
- Add intrabar priority calibration and sensitivity reporting.

3. Replay vs paper reconciliation
- Add per-strategy/day reconciliation between replay outcomes and paper fills.
- Surface divergence causes in governance and weekly reports.

4. Options replay depth
- Extend replay engine to richer options contract-level path assumptions and expiry handling.

5. Portfolio replay integration
- Feed replay trade streams directly into portfolio simulation to replace deterministic proxy path.

## Post-Execution-Realism Priorities (Added 2026-03-09)

1. Venue calibration
- Replace static profile coefficients with venue/time-window calibrated realized execution data.
- Priority: crypto perp venues first (funding + spread drift + high-vol windows).

2. Replay-vs-paper reconciliation
- Add per-strategy/day reconciliation report:
  - replay trigger vs paper fill,
  - cost/slippage delta attribution,
  - funding attribution.

3. Challenger replay depth
- Expand replay-backed daily series for challenger variants to reduce legacy backtest fallback.

4. Portfolio realism upgrade
- Replace deterministic portfolio proxy path with replayed trade-path aggregation.
- Keep scenario library and add realized correlation spikes.

5. Governance sign-off hardening
- Require reviewer sign-off when `survives_after_harsh_execution=false` but promotion is proposed.
- Persist assumption profile and sensitivity excerpt in promotion memo artifacts.

## Post-Governance-Hardening Priorities (Added 2026-03-09)

1. Human approval enforcement
- Add mandatory non-system reviewer for `CANARY -> PROD` and `PROD -> RETIRED`.
- Block promotion when approval state is not `APPROVED`.

2. Governance history persistence
- Persist strategy governance records and decision objects across cycles (not only per-run memory).
- Add diff view by strategy version for DD review.

3. Review memo artifact generation
- Auto-generate memo files from review records using `docs/STRATEGY_REVIEW_MEMO_TEMPLATE.md`.
- Link memo artifact paths into decision objects.

4. Concern severity model
- Add severity scoring for unresolved concerns and make critical severity auto-block promotions.

5. Governance dashboard/API
- Expose governance registry + typed decisions + review records in stable API contracts for reviewer tooling.

## Post-Discovery-Runtime Operationalization Priorities (Added 2026-03-09)

1. Doctrine/checklist enforcement
- Convert loaded doctrine/checklist seeds from metadata references into explicit pre-promotion policy gates.

2. Seed pruning and ranking loop
- Add weekly yield scoring per hypothesis/template and auto-flag persistently unused seeds for prune/rewrite.

3. Mapping-failure feedback loop
- Use discovery mapping failure counters to suggest seed edits (template hints, feature hints, regime tags).

4. Discovery run persistence
- Persist per-run seed utilization and mapping diagnostics for longitudinal analysis.

5. Validation linkage depth
- Couple seed-level diagnostics with replay-backed validation outcomes so candidate quality reflects both idea coverage and realism.

## Post-Runtime-Authenticity Priorities (Added 2026-03-09)

1. Broker/exchange real read-only adapters
- Implement real provider fetch path (credentials + signed request + schema normalization).
- Keep strict no-fabrication defaults.

2. US data freshness expansion
- Add incremental US updater to reduce stale daily/hourly windows after initial backfill.

3. Runtime signal family breadth
- Expand bar-driven runtime signal rules while preserving deterministic/explainable behavior.

4. Performance attribution depth
- Add realized vs paper decomposition by strategy/regime with minimum sample gating.

5. API wrapper parity for Next route handlers
- Reduce remaining duplication in `app/api/*` by moving to shared transport helpers where practical.

## Post-Reliability-Hardening Priorities (Added 2026-03-09)

1. Strict-fill monotonicity fix
- Ensure harsher fill assumptions cannot improve most strategies unless explicitly explained by model constraints.
- Add monotonicity guard in validation CI.

2. Governance stress reaction hardening
- Require demotion/rollback escalation when adverse execution realism consistently fails.
- Add mandatory reviewer path for execution-fragility cases.

3. Portfolio anti-crowding controls
- Add explicit family concentration penalty and crowding caps in portfolio simulation scoring.
- Add scenario-triggered allocation throttles.

4. Reliability regression gate
- Add CI gating for `reliabilityStressFramework` degraded scenarios above threshold.
- Version and diff `RELIABILITY_STRESS_REPORT.json` outputs.

5. Product graceful-degradation checks
- Add explicit no-trade and reduced-action UX contract checks under stress scenarios.

## A-minus Re-evaluation Follow-up (Added 2026-03-09)

1. Replay coverage gate enforcement
- Add `replay_coverage_ratio` as promotion-blocking check in governance.
- Require minimum replay-backed coverage threshold before CANARY/PROD progression.

2. Empirical portfolio mode
- Add historical covariance + event-driven replay mode as default DD evaluation path.
- Keep heuristic mode only as fallback/sensitivity comparator.

3. OOS survivability recovery program
- Add candidate retest queue with bounded parameter neighborhoods and regime-balanced sampling.
- Track causes of OOS failure per strategy family in weekly reports.

4. Human governance operationalization
- Enforce non-system reviewer for CANARY->PROD and major rollback/retire actions.
- Persist signed review memo links in governance decision objects.

5. Final DD polish
- Add CI gate for tests + reliability stress report.
- Add deterministic snapshot checks for `docs/archive/final_review_2026-03-09/*` and key research reports.

## Post-Credibility-Remediation Follow-up (Added 2026-03-09)

1. Cache observability
- Add lightweight cache metrics endpoint (hit/miss by context key dimensions) for operational debugging.

2. Status contract tightening
- Move API response contracts to explicit typed schemas to guarantee `source_status/data_status/source_label` consistency at compile-time.

3. Packaging verification in CI
- Add `package:source --dry-run` plus archive-content checks in CI to prevent accidental artifact leakage.

4. Runtime context expansion
- If watchlist/universe-scoped runtime derivation is introduced, wire `universeScope` from UI to API to cache key explicitly.

## Post-Homepage-IA Refactor Follow-up (Added 2026-03-12)

1. Add dedicated `top_signals` endpoint
- Move card-priority ranking to server-side query layer for stronger consistency across web/app clients.

2. Add watchlist write API
- Replace current local-only watchlist mutation path with DB-backed user watchlist while preserving offline fallback.

3. Add freshness SLA badges
- Differentiate stale thresholds by market/timeframe (US daily vs crypto hourly) in card-level UX.

4. Add homepage interaction telemetry
- Track `View Thesis`, `Paper Trade`, and `View All` usage to measure whether top-signal-first IA improves decision flow.

## Post-Evidence-Engine Upgrade Follow-up (Added 2026-03-12)

1. Walk-forward + evidence registry unification
- Persist walk-forward runs into `backtest_runs` with richer train/validation/test windows and evidence artifacts.

2. Reconciliation quality gates
- Add promotion/gov checks requiring minimum reconciliation coverage ratio before champion promotion.

3. Execution profile calibration
- Replace fixed profile constants with market/timeframe bucket calibration from observed paper fill gaps.

4. Artifact storage strategy
- Move large artifact payloads from inline JSON to file/object pointers when run volume grows.

5. Frontend evidence detail deep-linking
- Add direct Today card route to `/api/evidence/signals/:id` detail view and structured run artifact drill-down.

## Post-Panda-Integration Follow-up (Added 2026-03-12)

1. Persist factor score history
- Add table-backed storage for factor score/rank history to support week-over-week learning drift analysis.

2. Adaptive parameter governance
- Add guardrails for adaptive risk/position changes (max delta per day/week) and promote/demote criteria.

3. Cross-asset factor registry
- Align Panda factor names with discovery/feature catalog IDs so runtime learning and research discovery share ontology.

4. Replay validation hook
- Feed Panda-selected factors into evidence replay artifacts to measure if adaptive overlays improve net outcomes versus baseline.

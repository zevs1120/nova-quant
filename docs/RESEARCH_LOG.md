# Nova Quant Research Log

Last updated: 2026-03-14

## Current Research Questions

1. Which strategy families remain robust after OOS + cost stress?
2. Which regime transitions most frequently degrade opportunity quality?
3. Are we under-trading due to threshold pressure, risk constraints, or execution conversion?
4. Which shadow opportunities indicate useful loosening vs noise inflation?
5. Which lifecycle stage transitions are justified by validation evidence?
6. How should weekly automation recommendations map into governance actions?

## New Findings (This Session)

1. Strategy coverage now spans broader family/template space, including regime-transition and crypto-native specialists.
2. Regime engine now emits confidence, transition history, expected density band, and per-signal compatibility checks.
3. Risk system now models user/portfolio/trade layers with concentration and active-risk budgets.
4. Funnel now supports pass-stage counters and over-filtering diagnostics.
5. Shadow log now includes template/market/drawdown proxies and under-traded combination mapping.
6. Walk-forward now includes parameter sensitivity surface and promotion-readiness verdict.
7. Governance now includes stage policies and operation recommendations.
8. Automation loop now generates weekly summary, deterioration alerts, and candidate suggestions.
9. Product-facing opportunity objects now have evidence + lineage contracts.

## Assistant / Product Findings (2026-03-14)

1. The product no longer exposes two separate AI brains; frontend AI entrypoints now share one canonical backend assistant path.
2. Thread persistence materially improves follow-up quality because recent questions, risk profile, page context, and viewed signals can be reused coherently.
3. Deterministic retrieval is still useful, but only as an evidence selector / fallback layer, not as a competing user-facing assistant.
4. Prompt quality improved after replacing raw JSON dumping with sectioned evidence-first context assembly.
5. Relevance selection reduces prompt bloat and lowers the risk of assistant answers being driven by noisy low-priority JSON.
6. Broader provider fallback materially improves robustness in real failure modes beyond rate limiting.

## AI-Native Research Findings (2026-03-14)

1. The assistant can now answer factor/strategy/regime questions using a dedicated research tool layer instead of general chat heuristics.
2. Factor diagnostics are now structured around:
- supporting factors
- opposing factors
- regime context
- uncertainty
- implementation caveats
- next research action
3. "Why no signal?" is now explainable as a research object instead of only a user-facing empty state.
4. Backtest integrity and turnover/cost realism can now be surfaced directly in assistant answers and API responses.
5. The research layer now distinguishes between:
- taxonomy knowledge (definitions, expected failure modes, interactions)
- measured evidence (runtime rows, backtest artifacts, registry results)
6. Failed experiments are now usable as memory assets, not only missing strategy outcomes.
7. Research workflow planning is now first-class: the assistant can suggest the next concrete step from hypothesis to feature construction to validation to portfolio mapping.
8. Strategy evaluation and validation report objects now exist as explicit assistant/API outputs instead of being implied inside long-form chat responses.
9. A formal cross-asset research doctrine now constrains what the assistant should and should not claim, especially around commodities-first ambition vs current runtime reality.

## New Research Questions Enabled

1. Which factors are actually supporting the current signal, and which factors push against it?
2. Which factor families are likely to fail in the current regime even if the headline signal looks attractive?
3. Is this backtest worth trusting, or does it show signs of overfit / low-sample fragility?
4. Does turnover and cost drag make this idea unfit for production-like execution?
5. Why is the system staying out right now, and is that because of factor weakness, regime mismatch, or risk posture?
6. What should the next research step be before this idea deserves replay or paper?
7. Which past experiments were rejected for structural reasons versus temporary evidence weakness?

## Persistent Risks

1. Backtest behavior still shows realism and consistency concerns.
2. Shadow outcomes still rely on synthetic forward proxies.
3. Cost and slippage assumptions remain simplified.
4. Governance approval is mostly system-generated and needs reviewer workflow.
5. Assistant tool use is still prompt-routed rather than strict schema-based function calling.
6. Some secondary research/portfolio outputs still carry older proxy-style assumptions and should continue moving toward replay-backed evidence.

## Immediate Research Priorities

1. Backtest realism repair with execution-stage attribution.
2. Replace synthetic shadow path with realized forward joins.
3. Calibrate risk/funnel thresholds using rolling density targets.
4. Add promotion memo artifacts and reviewer signatures.
5. Build regression monitors for regime transition misclassification.
6. Add stricter assistant response evaluation for evidence fidelity and unsupported-claim suppression.
7. Promote replay-backed evidence summaries into more product surfaces so assistant references stay tied to canonical evidence paths.

## Session Update (2026-03-09, Credibility Remediation)

1. Runtime cache now isolates by user/risk/context, removing cross-context contamination risk in research-facing outputs.
2. Status semantics are now centralized (`runtimeStatus.ts`) and explicitly distinguish source provenance vs usability.
3. Runtime/API transparency now avoids misleading inner `DB_BACKED` labels when overall state is insufficient.
4. Historical review documents were archived to prevent outdated skepticism points from being misread as current state.
5. Local persistence keys were migrated to `nova-quant-*`, reducing demo-oriented residue in runtime behavior.

## Discovery Engine Findings (2026-03-08)

1. Hypothesis-driven candidate generation is now operational and traceable (`hypothesis -> template -> features -> params -> validation -> decision`).
2. Guided generation avoids brute-force explosion while still producing diverse candidates across families/regimes.
3. Five-stage validation now kills low-credibility candidates earlier (sanity and quick backtest gates remove most fragile variants).
4. Candidate Quality Score now provides a consistent promotion gate into `SHADOW`.
5. Discovery diagnostics now show which hypotheses and families are productive vs repeatedly failing.
6. Coverage gap diagnostics now expose regimes/asset classes where discovery is underperforming.

## Discovery-Centric Research Questions

1. Which hypothesis clusters sustain `PROMOTE_TO_SHADOW` rates over multiple cycles?
2. Which rejection reasons are structural (bad hypothesis) vs temporary (threshold too strict)?
3. Are candidate quality scores stable across changing regime states?
4. Does promoted discovery inventory improve portfolio diversification in paper cycles?

## Discovery Run Snapshot (2026-03-08)

Fixed-context run (same timestamp) after gate calibration:
- candidates generated: 40
- survivors after validation: 35
- promoted to SHADOW: 7
- hold for retest: 19
- rejected: 14

Interpretation:
- Discovery is no longer over-promoting by default.
- Pipeline now keeps a meaningful middle bucket (`HOLD_FOR_RETEST`) for iterative refinement.

## Research Materials Pack Findings (2026-03-08)

1. Nova Quant now has a structured reference foundation for official data sources and workflow frameworks.
2. Discovery now has a large seed base (100 hypotheses, 32 templates) for recurring candidate generation.
3. Universe seeds now support both focused execution (`core`) and wider discovery (`extended`) research modes.
4. Weekly research operations now have a reusable observation playbook and fill-in feed template.

## Material-Driven Research Priorities

1. Wire `hypothesis_registry_seed.json` and `strategy_template_seed.json` as optional discovery bootstrap inputs.
2. Introduce weekly scoring of hypothesis and template usefulness to prune low-value seeds.
3. Add source freshness and schema health into weekly feed output contract.
4. Start a weekly cadence where 10-20 questions from the question library are answered with evidence.

## Due-Diligence Platform Findings (2026-03-08)

1. Evidence chain is now explicit and queryable from hypothesis through production recommendation.
2. Portfolio-level simulation now complements single-strategy outputs with diversification and regime stability diagnostics.
3. AI Research Copilot now produces evidence-referenced insights instead of unstructured commentary.
4. Weekly research cycle now generates a repeatable report artifact for team operations and continuity.

## New Research Questions Enabled

1. Which promoted strategies have strongest evidence quality score and weakest missing-chain fields?
2. Which marginal strategy impacts are positive after correlation and risk-budget constraints?
3. Which copilot actions repeat weekly without leading to improvement (action-quality tracking)?
4. Which regime scenarios systematically destabilize portfolio simulation outcomes?

## Advanced Knowledge Pack Findings (2026-03-08)

1. Nova Quant now has explicit doctrine for alpha methodology, validation realism, and governance evidence standards.
2. Portfolio intelligence standards now define marginal contribution, drawdown concentration, and regime-specific failure analysis.
3. Quant and product failure-mode taxonomies are now standardized and ready for diagnostics/coplanar scoring use.
4. Weekly and monthly research operating frameworks now define cadence for funnel, shadow, degradation, discovery, and governance review.
5. Machine-readable policy seeds now exist for doctrine, failure modes, portfolio evaluation, and governance checklist scoring.

## New Higher-Order Research Questions Enabled

1. Which doctrine violations recur most often in candidates that fail SHADOW->CANARY promotion?
2. How often do portfolio concentration warnings precede strategy degradation events?
3. Which failure modes are most predictive of user-facing recommendation quality loss?
4. Which regime-drift signatures should trigger automatic demotion watchlists?
5. Which checklist items fail most often by strategy family, and should discovery constraints adapt?

## Global Review Findings (2026-03-08)

1. Research core is now structurally credible: discovery, validation, governance, evidence, portfolio simulation, and copilot all exist and are wired.
2. The dominant research credibility gap is still realism, not module absence.
3. Discovery engine can generate and score candidates, but core validation metrics remain simulation-proxy heavy.
4. Shadow opportunity analysis remains directionally useful but not yet bar-joined truth.
5. Portfolio intelligence has clear diagnostics but uses deterministic proxy dynamics.
6. Strongest immediate research gain would come from replay-backed validation + fill/cost realism + governance sign-off hardening.

## Replay Validation Findings (2026-03-09)

1. Replay module now produces deterministic event-ordered trade lifecycle outputs from historical bars.
2. Champion validation now has replay-backed daily series and no longer relies purely on synthetic backtest stream.
3. Shadow opportunity forward metrics now use replay-first outcomes; synthetic only as fallback.
4. Discovery quick-backtest stage now anchors to replay market benchmarks when available.
5. Current replay run snapshot (fixed timestamp):
- total_signals: 15
- triggered_trades: 7
- closed_trades: 7
- trigger_rate: 0.4667

## Replay-Centric Open Research Questions

1. How should intrabar priority be calibrated by market/liquidity regime (stop-first vs target-first)?
2. How does replay-vs-paper divergence vary by strategy family and regime?
3. Which challenger families need direct replay mapping instead of legacy backtest fallback?
4. How much do dynamic spread/liquidity features change replay realism under stress windows?

## Execution Realism Findings (2026-03-09)

1. Validation now uses profile-based assumptions instead of scalar cost constants.
2. Strategy survivability under harsh assumptions is now explicit (`survives_after_harsh_execution`).
3. Spread and funding are now first-class stress channels in both validation and portfolio diagnostics.
4. Fill-policy strictness meaningfully changes trigger density for fragile candidates.
5. Evidence chain now carries assumption profile and realism notes, improving DD traceability.

## Execution Realism Open Questions

1. Which strategy families lose promotion-readiness when strict-fill stress is applied?
2. How should funding drag be modeled directionally (payer/receiver) once richer funding data is live?
3. What fill-policy calibration should be used by regime (trend vs risk-off)?
4. Which markets require venue-specific spread/slippage calibration first (highest sensitivity)?
5. How should portfolio simulation transition from deterministic proxy path to replay trade-path aggregation?

## Governance Hardening Findings (2026-03-09)

1. Governance stage transitions are now tied to explicit required checks, not only confidence heuristics.
2. Strategy versions now have inspectable governance records with promotion/demotion/rollback histories.
3. Review workflow is now structured and exportable (reviewer, timestamp, evidence links, unresolved concerns).
4. Decision artifacts are now typed (`PromotionDecision`, `DemotionDecision`, `RollbackDecision`, `RetirementDecision`).
5. Registry now exposes governance readiness fields required for faster internal/external audit.

## Governance Open Questions

1. Should PROD promotions require non-system reviewer approval by default before final stage transition?
2. How should unresolved concerns be severity-ranked to auto-block promotion in mixed-check cases?
3. How should governance histories be persisted across runs for long-horizon audit continuity?
4. What minimum live-like paper duration should be mandatory before CANARY -> PROD in future live adapters?

## Discovery Runtime Operationalization Findings (2026-03-09)

1. Discovery now consumes hypothesis/template/feature/doctrine/checklist seeds at runtime rather than relying mostly on in-file registries.
2. Hypothesis-template mapping quality is now measurable (template hint mismatch and feature mismatch are explicit counters).
3. Seed utilization is now observable:
- which hypotheses produce candidates
- which templates are used most
- which seeds remain unused
4. Constrained discovery runs now work by market/asset/family/horizon/risk profile; candidate populations can be intentionally narrowed.
5. Candidate metadata now captures source lineage and constraints, improving traceability for downstream validation and governance.

## Discovery Runtime Open Questions

1. Should doctrine/checklist seeds become hard validation gates instead of metadata-only references?
2. How should unused-seed pruning be automated over weekly cycles?
3. What threshold should classify a hypothesis as persistently low-yield vs temporarily suppressed by regime?

## Reliability Stress Findings (2026-03-09)

1. Regime and risk modules handle elevated-volatility, risk-off, and concentration stress with coherent defensive posture transitions.
2. Discovery starvation scenario is now diagnosable with explicit mapping-failure outputs instead of silent low-density behavior.
3. Execution stress currently shows a realism inconsistency: strict-fill assumptions can improve most strategies in some runs (monotonicity violation).
4. Portfolio crowding scenario shows fake-diversification risk: correlation spikes can remain high even when strategy count appears diversified.
5. Governance outputs remain structured under stress, but demotion/rollback depth is still lighter than institutional expectation under adverse execution realism.

## Reliability Research Questions

1. Why does strict-fill stress improve several strategies in current walk-forward modeling, and which cost components are under-penalized?
2. Should portfolio diversification scoring include explicit family-concentration penalties beyond HHI + pairwise correlation?
3. What governance thresholds should force non-optional demotion when execution realism monotonicity fails?
4. Which strategy families consistently fail under poor-fill stress and should be capped in allocation until recalibrated?

## A-minus Re-evaluation Findings (2026-03-09)

1. **Validation consistency**
- Strict-fill monotonicity path is now runtime-stable again after regression fix in walk-forward module.
- Monotonicity remains wired into both validation verdicts and governance checks.

2. **Portfolio realism hardening**
- Added family crowding guard in portfolio allocation to reduce fake diversification risk.
- Portfolio outputs now include concentration-control diagnostics with before/after family exposure attribution.

3. **Stress framework interpretation quality improved**
- Poor-fill scenario now verifies governance response from typed decision artifacts, not ambiguous fields.
- Crowding scenario now checks mitigation effectiveness (cap enforcement) while preserving correlation-pressure diagnostics.

4. **Current empirical bottleneck remains unchanged**
- Latest baseline still shows limited replay-backed strategy coverage and weak OOS survival.

## Runtime Authenticity Findings (2026-03-09)

1. Runtime signal generation is now bar-driven in backend sync path rather than mock-fed defaults.
2. Market state/regime fields now come from deterministic OHLCV-derived features (trend/volatility/temperature/risk-off).
3. Performance snapshots now withhold low-sample metrics instead of defaulting to optimistic values.
4. Chat context lineage now reflects DB/runtime status directly and no longer falls back to mock files.
5. Connector outputs now reflect honest disconnected state by default, reducing DD credibility risk.

## New Research Constraints Introduced

1. If coverage/freshness is weak, runtime should degrade to `INSUFFICIENT_DATA` rather than force opportunity density.
2. If execution sample is low, performance metrics should be `null`/withheld, not inferred from synthetic proxies.
3. Runtime recommendation quality is now explicitly tied to data freshness, reducing false confidence risk.
- This confirms remaining maturity risk is empirical depth, not architecture completeness.

## Updated Research Focus After Re-evaluation

1. Raise replay-backed coverage across governed strategies.
2. Improve OOS survivability with stricter candidate pruning + retest loops.
3. Move portfolio simulation from heuristic-dominant path to replay-driven empirical mode.
4. Operationalize human review sign-off in governance transitions.

## Homepage Execution-Priority Update (2026-03-12)

1. Today page now puts top-ranked actionable signals in the first module to tighten decision latency.
2. Signal prioritization now explicitly penalizes stale/insufficient/withheld records and rewards actionability + freshness.
3. Signal transparency remains first-class on card level (status/source labels are visible, not hidden).
4. Diagnostic and proof modules were intentionally moved below opportunity cards so product flow starts from "what should I do now?".

## Evidence Engine Integration Findings (2026-03-12)

1. Canonical evidence path now exists end-to-end:
- runtime signals -> signal snapshots -> portfolio replay -> metrics/artifacts -> reconciliation -> registry.

2. Portfolio replay output is now formally persisted and queryable:
- no longer only transient analytics output.

3. Replay-vs-paper reconciliation now produces structured availability states:
- `RECONCILED`
- `PAPER_DATA_UNAVAILABLE`
- `REPLAY_DATA_UNAVAILABLE`
- `PARTIAL`

4. Attribution is now persisted as an artifact, not only shown in-memory:
- strategy family
- symbol
- market/asset class
- regime
- conviction bucket
- holding horizon
- long/short side
- cost bucket.

5. Top signal ranking can now consume evidence metadata directly:
- supporting run linkage
- reconciliation availability
- evidence freshness.

## Evidence Engine Open Questions

1. Should walk-forward runs be folded into the same evidence API list view as first-class run types by default?
2. Should champion/challenger promotion require reconciliation coverage threshold, not only replay metrics?
3. Should execution profile calibration become market/timeframe-specific (beyond baseline/stress pair) before promotion?

## Panda Self-Improvement Integration Findings (2026-03-12)

1. Strategy generation is now hybrid:
- existing deterministic OHLCV rule engine remains primary,
- Panda factor-learning layer now acts as adaptive overlay for direction confidence and signal fallback.

2. Factor-learning feedback loop now active:
- factors are scored by correlation with forward returns,
- top factors are selected per runtime derivation cycle,
- selected factors are attached to signal metadata/checklists.

3. Risk adaptation is now performance-aware:
- recent execution history drives adaptive risk/position parameters,
- risk bucket constraints now participate in signal allow/skip decisions.

4. Integration remains honest:
- insufficient bars -> Panda learning status degrades cleanly (`INSUFFICIENT_DATA`),
- no mock or synthetic fill paths were introduced.

# Strategy Audit Checklist

Last updated: 2026-03-08

Use this checklist before any promotion decision.

## A) Hypothesis and template quality

- [ ] Hypothesis is clear, testable, and economically plausible.
- [ ] Template matches the stated hypothesis logic.
- [ ] Compatible markets and regimes are explicitly declared.
- [ ] Holding horizon is explicit and consistent.

## B) Feature and data quality

- [ ] Feature set is relevant (no clutter) and reproducible.
- [ ] Data freshness/coverage are adequate.
- [ ] No known leakage or timestamp-alignment issues.
- [ ] Missingness and stale-data risks are documented.

## C) Validation quality

- [ ] Candidate passed sanity checks with realistic assumptions.
- [ ] Walk-forward and OOS results are acceptable.
- [ ] Parameter neighborhood stability is acceptable.
- [ ] Cost/slippage sensitivity does not break edge.
- [ ] Regime-sliced behavior is understood.

## D) Risk and execution realism

- [ ] Risk bucket assignment is justified.
- [ ] Size-down/block conditions are explicit.
- [ ] Execution realism assumptions are plausible.
- [ ] No unresolved concentration or overlap warnings.

## E) Portfolio usefulness

- [ ] Candidate improves diversification or drawdown profile.
- [ ] Correlation with existing PROD set is acceptable.
- [ ] Marginal contribution remains positive after costs.

## F) Explainability and product readiness

- [ ] Opportunity outputs include entry/stop/target/invalidation.
- [ ] Rationale is concise and evidence-grounded.
- [ ] No-trade guidance and risk boundaries are clear.

## G) Governance readiness

- [ ] Evidence chain is complete.
- [ ] Promotion rationale is recorded.
- [ ] Rollback and retirement triggers are defined.
- [ ] Reviewer/source metadata is present.

## Scoring recommendation (optional)

- 90-100: promotion-ready
- 75-89: hold for retest / constrained canary
- 60-74: shadow only
- below 60: reject or redesign hypothesis/template

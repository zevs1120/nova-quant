# Weekly Research Operating System

Last updated: 2026-03-08

This operating system defines Nova Quant's weekly research cadence.

## Weekly cadence (recommended)

## Step 1: Funnel review (Monday)

Inputs:

- signal funnel metrics,
- no-trade reason top N,
- per-family and per-regime drop-off.

Outputs:

- bottleneck diagnosis,
- threshold tuning candidates,
- starvation warnings.

## Step 2: Shadow review (Tuesday)

Inputs:

- filtered/near-threshold opportunities,
- forward outcomes,
- missed-opportunity diagnostics.

Outputs:

- filters likely too strict,
- bounded relaxation experiments.

## Step 3: Strategy health review (Wednesday)

Inputs:

- strategy lifecycle metrics,
- degradation signals,
- regime performance deltas.

Outputs:

- demotion watchlist,
- rollback candidates,
- investigation priorities.

## Step 4: Discovery review (Thursday)

Inputs:

- hypotheses selected,
- generated candidates,
- validation outcomes.

Outputs:

- promoted SHADOW candidates,
- hypothesis/template productivity map,
- next discovery focus by regime gap.

## Step 5: Governance review (Friday)

Inputs:

- evidence bundles,
- promotion proposals,
- audit checklist results.

Outputs:

- approved promotions/demotions,
- required reviewer notes,
- retirement actions.

## Step 6: Product-output review (Friday)

Inputs:

- daily brief quality,
- holdings recommendation quality,
- AI explanation quality.

Outputs:

- wording/explanation fixes,
- risk communication improvements,
- no-trade guidance calibration.

## Required artifacts each week

1. `docs/research_reports/WEEKLY_RESEARCH_REPORT.md` update.
2. governance decision objects for stage changes.
3. top 3 research actions for next week.
4. updates in `docs/RESEARCH_LOG.md` and `docs/NEXT_STEPS.md`.

## Primary module consumers

- `src/research/weekly_cycle/weeklyResearchCycle.js`
- `src/research/copilot/aiResearchCopilot.js`
- `src/research/core/researchAutomationLoop.js`

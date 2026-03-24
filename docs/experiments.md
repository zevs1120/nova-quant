# Experiments Log v1

## Purpose

Track strategy evolution with structured metadata.

Implemented in `buildExperiments` within `src/quant/researchLoop.js`.

## Experiment Contract (`Experiment`)

- `experiment_id`
- `strategy_id`
- `version_id`
- `created_at`
- `status`
- `notes`
- `comparison_summary`

## Current Behavior

- Champion is logged as baseline (`promoted`).
- Each challenger is logged with current decision status (`testing`/`candidate`).
- Summaries include comparison deltas (`Δret`, `Δdd`).

## Where It Is Used

- Internal Research page:
  - experiment log table
  - linked with promotion decisions and governance rules

## Persistence

Experiments are merged into local research store:

- key: `experiment_id`
- deduped and capped history

## Data Honesty

Experiment conclusions are derived from sample/simulated research objects only.
No live promotion claim is made in this build.

## Future Upgrade Targets

1. Add hypothesis field and explicit test plan.
2. Add owner/reviewer metadata.
3. Add reproducibility hash (dataset + config + code version).

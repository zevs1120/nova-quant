# Signal Funnel

Last updated: 2026-03-08

## Purpose

The signal funnel explains where opportunities are lost and why trade density changes.
It is designed as a research monitoring system, not a UI-only metric block.

## Canonical Funnel Stages

1. `universe`
2. `prefilter_passed`
3. `generated`
4. `regime_filter_passed`
5. `score_threshold_passed`
6. `risk_filter_passed`
7. `conflict_filter_passed`
8. `executable`
9. `entered_positions`
10. `filled`
11. `roundtrip`

The diagnostics object also keeps filtered counters:
- `regime_filtered`
- `score_filtered`
- `risk_filtered`
- `conflict_filtered`

## Diagnostics Outputs

- overall counters
- stage drop-off ratios
- no-trade reason Top N
- bottleneck diagnosis
- threshold sensitivity diagnostics
- over-filtering detection
- per-strategy-family metrics
- per-regime metrics
- per-market metrics
- per-asset-class metrics
- per-trade-day metrics

## No-Trade Reason Examples

- `regime_blocked`
- `score_too_low`
- `risk_budget_exhausted`
- `correlation_conflict`
- `execution_window_closed`
- `policy_filtered`

## Research Questions It Answers

- Are we starved because universe is too small?
- Are thresholds too tight?
- Are risk rules too conservative?
- Are we failing between executable and fill stages?
- Which family/regime is underproducing executable opportunities?

## Shadow Opportunity Link

Filtered records feed the shadow log for:
- missed opportunity analysis,
- reduced-size viability,
- strictness diagnostics,
- under-traded family/regime mapping.

## Implementation

- `src/research/core/signalFunnelDiagnosticsV2.js`
- `src/research/core/shadowOpportunityLog.js`

# Governance and Promotion Rules v1

## Principle
Nova Quant v1 uses **controlled promotion**, not automatic live self-modification.

Every challenger must pass checklist gates before entering candidate stage.

## Status Model
Supported statuses:
- `draft`
- `testing`
- `paper`
- `candidate`
- `promoted`
- `retired`

Current registry is exposed in research output:
- `governance.version_registry`

## Promotion Rules
Rules are structured objects (`id`, `rule`, `threshold`, `gate`).

Current gates:
1. Return improvement threshold.
2. Drawdown deterioration cap.
3. Turnover deterioration cap.
4. Regime stability floor.
5. Risk-adjusted score non-regression.

All rules are `must_pass` in v1.

## Evidence Sources
Promotion relies on:
- backtest result objects
- paper ledger summary
- diagnostics outputs
- champion/challenger overlap and stability stats

## Rollback Safety
Because champion is retained and challengers are parallel:
- rollback is deterministic (keep champion active)
- no irreversible mutation path is introduced in v1

## Future Upgrade Targets
1. Manual approval step with signed review notes.
2. Multi-stage gate: testing -> paper -> candidate -> promoted.
3. Hard kill switch if post-promotion guardrail breaches.

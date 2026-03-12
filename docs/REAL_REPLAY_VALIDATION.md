# Real Replay Validation in Nova Quant

Last updated: 2026-03-09

## 1) What replay means in Nova Quant

In Nova Quant, replay means validating opportunities against **historical bar sequences in event order** instead of only synthetic return proxies.

Replay lifecycle:
1. signal formation event
2. signal filtering event (risk/no-trade gates)
3. event-ordered entry checks with explicit fill policy
4. post-entry stop/take-profit/expiry evaluation in bar order
5. realized trade outcome with fill, slippage, spread, fee, and funding assumptions

This is implemented as a first-class module:
- `src/research/validation/historicalReplayValidation.js`

## 2) Modules now using replay

### A. Walk-forward validation
- File: `src/research/core/walkForwardValidation.js`
- Upgrade:
  - now builds `replay_validation` outputs,
  - champion strategy validation can consume replay-backed daily series,
  - each strategy output includes `replay_context` with source/coverage,
  - strategy output now includes `execution_realism` scenario sensitivity.

### B. Shadow opportunity diagnostics
- File: `src/research/core/shadowOpportunityLog.js`
- Upgrade:
  - now prefers replay-derived forward outcomes via `signal_outcome_map`,
  - falls back to synthetic path only when replay data is unavailable,
  - each shadow record includes `forward_path_source`.

### C. Discovery candidate quick validation
- File: `src/research/discovery/candidateValidation.js`
- Upgrade:
  - quick-backtest stage now can anchor to replay market benchmarks,
  - outputs `replay_anchor_used` metadata.

## 3) Replay capability details

Replay engine now supports:
- event-ordered signal formation/filtering/entry/exit lifecycle,
- regime-aware context attachment,
- entry trigger by policy (`touch`, `bar-cross`, `conservative`, optional optimistic test mode),
- stop/take-profit evaluation with explicit intrabar ordering assumption,
- expiry/horizon close-out logic,
- fill/slippage/spread/fee/funding assumptions by market and volatility bucket,
- realized holding duration,
- realized PnL pre-cost and post-cost,
- mark-to-market drawdown path per trade,
- per-signal forward outcome map for diagnostics.

For each replayed signal/opportunity, Nova Quant records:
- `signal_time`
- `regime_state`
- `replay_entry_event`
- `replay_exit_event`
- `fill_assumption_used`
- `slippage_assumption_used`
- `assumption_profile`
- `realized_holding_duration`
- `realized_pnl_pre_cost_pct`
- `realized_pnl_pct`
- `drawdown_path` + `drawdown_summary`
- whether the trade actually triggered

## 4) What realism improved

Compared to prior proxy-only paths:
- validation now has bar-sequence-grounded execution checks,
- trade triggering is no longer assumed,
- stop/take-profit conflicts are handled via explicit intrabar priority assumptions,
- shadow forward outcomes can come from real replay paths,
- walk-forward now reports replay backing status per strategy,
- replay now emits scenario sensitivity under harsher execution assumptions.

## 5) What remains approximate

Replay is materially better but still not full execution-grade realism:
- bar-level replay cannot model tick-level path/order queue priority,
- intrabar order is assumption-based (`stop_first` by default),
- assumptions are profile-based but not yet venue-time-series calibrated,
- replay coverage is strongest for champion/current signal stream; challenger mapping still partially legacy,
- options-specific microstructure replay is still limited.

## 6) Auditability and reproducibility

Replay outputs are deterministic under fixed input state and assumptions.
Key contracts emitted from walk-forward:
- `walk_forward_validation.replay_validation`
- `walk_forward_validation.strategies[*].replay_context`

These can be consumed by:
- evidence system,
- governance scoring,
- shadow diagnostics,
- portfolio simulation (next-phase deeper integration).

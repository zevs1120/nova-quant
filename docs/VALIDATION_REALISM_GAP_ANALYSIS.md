# Validation Realism Gap Analysis

Last updated: 2026-03-09

## Purpose

This document tracks validation realism before and after replay integration.

## 1) What was synthetic before

### Walk-forward validation

- Source file: `src/research/core/walkForwardValidation.js` (pre-upgrade)
- Prior behavior:
  - consumed strategy `backtest.daily` proxy series,
  - no event-level entry/exit replay,
  - cost/slippage stress performed on synthetic daily return streams.

### Shadow opportunity outcomes

- Source file: `src/research/core/shadowOpportunityLog.js` (pre-upgrade)
- Prior behavior:
  - used `syntheticForwardPath` deterministic proxy,
  - no bar-joined forward performance.

### Discovery quick backtest

- Source file: `src/research/discovery/candidateValidation.js` (pre-upgrade)
- Prior behavior:
  - quick performance derived from deterministic hash/noise formulas,
  - no replay-grounded anchor.

## 2) What is now replay-based

### A. Historical replay engine added

- New file: `src/research/validation/historicalReplayValidation.js`
- Replay now includes:
  - event-ordered lifecycle,
  - entry trigger checks,
  - stop/take-profit/expiry exits,
  - fill/slippage/spread/fee/funding assumptions,
  - realized PnL and drawdown path.

### B. Structured execution realism layer added

- New file: `src/research/validation/executionRealismModel.js`
- Upgrade:
  - profile-based assumptions (`replay/backtest/paper`),
  - volatility-bucketed slippage/spread,
  - configurable fill policies,
  - scenario sensitivity (`+25%`, `+50%`, wider spread, adverse funding, strict fill).

### C. Walk-forward integration

- File: `src/research/core/walkForwardValidation.js`
- Improvements:
  - emits `replay_validation`,
  - strategy rows expose `replay_context`,
  - champion can use replay-backed daily aggregate series when coverage is sufficient,
  - execution realism now feeds strategy-level stress verdicts.

### D. Shadow log integration

- File: `src/research/core/shadowOpportunityLog.js`
- Improvements:
  - consumes `replay_validation.signal_outcome_map` when available,
  - records `forward_path_source` to show replay vs fallback origin.

### E. Discovery quick-stage realism anchor

- File: `src/research/discovery/candidateValidation.js`
- Improvements:
  - quick-backtest can anchor on replay market benchmarks,
  - records `replay_anchor_used`.

## 3) What is still unresolved

1. Tick-level execution realism is still absent (bar-level only).
2. Intrabar hit ordering remains assumption-driven.
3. Assumptions are profile-based and volatility-bucketed, but still not calibrated from venue-level realized execution history.
4. Replay-backed validation is strongest for champion/current signal stream; challengers still partly rely on legacy backtest streams.
5. Options replay depth remains limited.
6. Portfolio simulation now includes execution sensitivity, but still uses deterministic proxy path (not full replay-driven portfolio path).

## 4) Additional data needed for further realism

1. Higher-frequency bar or tick data for intrabar execution ordering.
2. Depth/spread/liquidity history for dynamic slippage and fill-probability modeling.
3. Real paper execution logs mapped to signal IDs for replay-vs-paper reconciliation.
4. Venue-specific fee/funding snapshots over time.
5. Extended historical labeled regimes for stronger regime-sliced replay validation.

## 5) Current credibility position

Nova Quant is now beyond proxy-only validation for core signal lifecycle replay.
However, it is still in a **hybrid replay + approximation** state and should be presented as such under technical due diligence.

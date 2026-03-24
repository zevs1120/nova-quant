# Strategy Decay and Regime Drift

Last updated: 2026-03-08

This document defines how Nova Quant distinguishes normal variance from structural degradation.

## 1) Why strategies decay

Strategies decay because:

- market participants adapt,
- microstructure changes,
- cost structure shifts,
- regime frequency changes,
- crowding increases.

## 2) Decay vs variance

Normal variance:

- temporary metric noise,
- no major change in signal/fill behavior,
- expected drawdown distribution.

Decay:

- persistent drop in expectancy,
- rising slippage sensitivity,
- lower conversion through funnel stages,
- worsening regime-specific outcomes.

## 3) Regime drift impact

Even stable strategy logic can underperform when regime distribution shifts.
Example: trend strategy during prolonged range/high-vol state.

## 4) Early detection signals

1. Recent-vs-historical performance gap beyond tolerance.
2. Stability score decline across rolling windows.
3. Rising no-trade or blocked-trade rates for previously healthy setups.
4. Increasing concentration of losses in one regime.

## 5) Comparison framework

Compare by:

- same template/version,
- same asset universe,
- same cost assumptions,
- regime-matched slices.

## 6) Demote vs retire decisions

Demote when:

- decay may be regime-conditional,
- robustness remains acceptable after re-sizing,
- portfolio contribution remains positive.

Retire when:

- decay is persistent across regimes,
- cost-adjusted edge is gone,
- fragility and governance warnings compound.

## 7) Governance linkage

This doctrine should feed:

- `src/research/core/strategyGovernanceV2.js` demotion/retirement rules,
- `src/research/core/researchAutomationLoop.js` deterioration alerts,
- weekly cycle degradation summary outputs.

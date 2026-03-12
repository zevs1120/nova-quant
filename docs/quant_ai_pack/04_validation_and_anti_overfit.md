# Validation and Anti-Overfit Protocol

## Absolute rule
No strategy may be promoted based on in-sample beauty alone.

## Required tests

### 1. Walk-forward validation
- rolling train/validate/test windows
- report stability by window
- report degradation out-of-sample

### 2. Regime-sliced validation
For each strategy, report performance in:
- uptrend-normal
- uptrend-highvol
- range-normal
- range-highvol
- downtrend-normal
- risk-off/stress

### 3. Cost-sensitive validation
For each strategy, rerun under:
- base cost
- base + 25%
- base + 50%
- adverse slippage stress

### 4. Capacity / crowding sensitivity
Check whether edge collapses when:
- position size increases
- liquidity filters tighten
- less liquid names are included

### 5. Parameter neighborhood stability
A strategy only passes if nearby parameters are not dramatically worse.

### 6. Trade count sufficiency
Reject extremely sparse strategies unless there is a strong economic reason.

### 7. Reality checks
Log:
- average hold duration
- win/loss asymmetry
- worst loss cluster
- max drawdown
- turnover
- regime dependence

## Promotion requirements
A candidate can only move forward if it is:
- economically interpretable,
- robust across windows,
- not hyper-fragile to costs,
- and useful in portfolio context.

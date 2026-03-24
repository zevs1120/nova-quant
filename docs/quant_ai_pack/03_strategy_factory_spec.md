# Strategy Factory Spec

## Goal

Continuously generate candidate strategies without turning the system into an ungoverned black box.

## Strategy families required

1. Trend following
2. Breakout / volatility expansion
3. Mean reversion
4. Regime switch / state transition
5. Relative strength / intermarket leadership
6. Crypto funding / basis / carry
7. Flow / velocity / liquidation-aware setups

## Candidate generation modes

### A. Template expansion

Given a family template, vary:

- lookbacks
- thresholds
- volatility normalization rules
- holding periods
- stop structures
- universe subsets
- regime filters

### B. Rule composition

Compose blocks like:

- trend filter + pullback trigger
- range regime + zscore reversal
- funding extreme + carry decay
- breakout + velocity confirmation

### C. Controlled search

Search only within bounded spaces with:

- parameter ranges,
- max complexity,
- min trade count,
- max turnover,
- cost constraints.

## Hard constraints for any candidate

- Must declare applicable market(s)
- Must declare expected holding horizon
- Must declare cost model
- Must declare why it should exist economically
- Must declare kill conditions

## Strategy metadata schema

- candidate_id
- family
- thesis
- market_scope
- regime_scope
- feature_dependencies
- parameter_space_json
- cost_assumption_version
- max_holding_days
- expected_trade_density_band
- status

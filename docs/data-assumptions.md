# Data Assumptions (Nova Quant v1)

## 1. Data Provenance
This prototype uses mixed source tags:
- `sample_market_data`: deterministic local generated market dataset
- `derived_features`: computed from sample market bars
- `simulated_signals`: rule-engine generated opportunities
- `sample_backtest`: historical-like simulated proof data
- `simulated_paper`: paper execution simulation
- `live_not_available`: live data intentionally unavailable in demo

## 2. Universe Assumptions
### US / ETF sample universe
Includes high-liquidity names and ETFs such as:
- SPY, QQQ, IWM
- AAPL, MSFT, NVDA, AMZN, META, GOOGL, TSLA
- JPM, XLF, XLE, XLK

### Crypto sample universe
- BTC-USDT, ETH-USDT, SOL-USDT

## 3. Market Data Generation Rules
Implemented in `src/quant/sampleData.js`:
- deterministic pseudo-random path (same logic -> reproducible)
- OHLCV generated around ticker-specific base price, drift, and vol profile
- US uses trading-day calendar; crypto uses all-day calendar
- per bar includes: `open/high/low/close/volume/vwap/ret_1d`

## 4. Derived Field Assumptions
Derived fields include:
- `adv_20`: 20-day average volume
- `volatility_20`: annualized realized volatility
- return buckets (`d1/d5/d10/d20/d60`)
- trend/mean-reversion/volume/volatility/cross-section features

## 5. Risk and Portfolio Assumptions
Default risk profile: `balanced`.
- max holdings, max single weight, sector cap are profile-driven
- gross/net exposure depends on regime class
- hard filters: liquidity floor, gap chase filter, regime gate, concentration cap

## 6. Performance Assumptions
Backtest and paper performance use deterministic monthly return arrays.
- no claim of real fills
- no claim of live broker connection
- `Live` remains explicit as upcoming

## 7. Research Loop and Storage Assumptions
- Daily research snapshots are generated from deterministic reruns by date.
- Historical records are merged into local research store:
  - browser localStorage key: `nova-quant-research-store-v1`
  - fallback: in-memory store (non-browser environment)
- Stored entities include:
  - `daily_snapshots`
  - `model_history`
  - `risk_history`
  - `portfolio_history`
  - `alpha_daily_stats`
  - `promotion_decisions`
  - `experiments`
- This is a mock/local persistence layer, not an external research DB.

## 8. Multi-Asset Assumptions
- Equities/options/crypto spot are generated through dedicated adapters and schemas.
- Runtime default mode is `sample_fallback` with explicit `live_path_available` metadata where provider paths exist.
- Options data keeps contract/chain structure and underlying linkage; it is not flattened into stock-ticker format.
- Crypto bars use 24/7 dates and are not forced into US trading-session assumptions.

## 9. AI Assumptions
AI answers are retrieval-based templates over current in-memory state.
- no external LLM inference required for baseline behavior
- answers are structured and evidence-linked
- evidence references the current sample/simulated metrics and research diagnostics

## 10. Non-Goals in v1
- no real-time market feed
- no order routing
- no automated broker execution
- no audited live performance track record

# Multi-Asset Data Sources (v1)

## Selection Principles
1. Official/publicly documented APIs first.
2. Stable schema and explicit licensing over ad-hoc scraping.
3. If live source is unavailable in demo runtime, fallback is explicit (`sample_fallback`) and never presented as live.

## US Equities
### Primary live path
- Provider path: Polygon Stocks API (official docs)
- Use cases:
  - daily OHLCV aggregates
  - ticker reference metadata
  - benchmark ETFs

### Secondary/backup path
- Stooq bulk historical packs (scripted ingestion path already exists in `src/server/ingestion/stooq.ts`)

### v1 runtime mode
- Current frontend runtime default: `sample_fallback`
- Adapter: `src/data_sources/equities/equityAdapter.js`
- Live path metadata is still emitted in adapter output for controlled upgrade.

## US Equity Options
### Primary live path
- Provider path: Polygon Options API (official docs)
- Use cases:
  - option contracts reference
  - option chain snapshots
  - contract bars/snapshots (if licensed)
  - IV / OI / volume / greeks

### v1 runtime mode
- Current frontend runtime default: `sample_fallback`
- Adapter: `src/data_sources/options/optionsAdapter.js`
- Underlying linkage is mandatory in schema and generated sample.

## Crypto Spot
### Primary live path
- Provider path: Coinbase Exchange public endpoints (official docs)
- Use cases:
  - products
  - candles
  - ticker snapshots

### v1 runtime mode
- Current frontend runtime default: `sample_fallback`
- Adapter: `src/data_sources/crypto/cryptoSpotAdapter.js`
- 24/7 calendar handling is preserved end-to-end.

## Source Boundary and Honesty
Each object stores:
- `source`
- `fetched_at`
- `frequency`
- identifier (`symbol`/`option_ticker`/`product_id`)
- `data_status` (`raw`/`normalized`/`derived`)
- `use_notes`
- `license_notes`

No simulated dataset is labeled as live execution evidence.

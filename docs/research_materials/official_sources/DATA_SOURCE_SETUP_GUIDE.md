# Data Source Setup Guide

Last updated: 2026-03-08

This guide provides practical setup priorities for Nova Quant data integrations.

## 1) Quick Setup Path

1. Start with **public crypto market-data endpoints** (Binance, Bybit, Deribit public market APIs) to activate funding/OI/basis and liquidity stress features quickly.
2. Add **Polygon REST + websocket** for US equities baseline and options expansion.
3. Expand into options-flow and higher-frequency microstructure streams only after base contracts and freshness monitors are stable.

## 2) Access and Credential Requirements

| Source | Key Required | Free/Public Access | Paid / Plan Constraints | Real-time Limit Notes |
|---|---|---|---|---|
| Polygon (stocks/options REST+WS) | Yes | Docs public; practical API usage needs key | Yes, plan-entitlement based | Real-time depth/channels vary by plan |
| Binance market data (funding/OI/etc.) | No for public market endpoints | Yes for market data endpoints | Trading/private endpoints need key | Rate limits and weight rules apply |
| Bybit V5 market data | No for public market endpoints | Yes for market endpoints | Private/trade/account endpoints need key | Category-specific endpoint behavior |
| Deribit public market data | No for public market endpoints | Yes | Advanced/private operations need auth | Websocket recommended for low-latency streams |
| Qlib / vectorbt / backtrader / zipline | No API key (framework docs/tools) | Yes | Optional commercial add-ons may exist outside OSS scope | Not market-data sources; workflow/backtest references |

## 3) Integration Priority Tiers

## Tier 1 — Must-Use / Highest Priority

| Source | Why Tier 1 | Immediate Nova Quant Usage |
|---|---|---|
| Polygon (equities baseline) | Core US equity data contract for Nova Quant mission | Universe metadata, OHLCV, snapshots, stock websocket events |
| Binance funding + OI endpoints | Fast activation of crypto-native features | Funding dislocation, OI trend, carry diagnostics |
| Bybit market tickers + funding + OI | Cross-venue confirmation and redundancy | Exchange divergence, robustness checks, fallback stream |
| Deribit public ticker/ws ticker | Derivatives-rich crypto context | Basis/volatility/options-aware context fields |

## Tier 2 — Useful Expansion

| Source | Why Tier 2 | Usage |
|---|---|---|
| Polygon options websocket + options overview docs | Enables options-linked overlays and richer volatility context | Options flow features, event-volatility overlays |
| Deribit market-data best-practices doc | Improves ingestion reliability and feed robustness | Reconnect/recovery policy, stream integrity controls |
| Qlib workflow references | Strong research orchestration ideas | Experiment tracking, workflow discipline patterns |
| vectorbt usage/features docs | Fast research prototyping references | Parameter sweeps and research diagnostics patterns |

## Tier 3 — Optional / Future

| Source | Why Tier 3 | Usage |
|---|---|---|
| Backtrader strategy docs | Event-driven simulation pattern reference | Optional secondary simulation architecture |
| Zipline tutorial/API docs | Institutional-style backtest contract reference | Validation architecture benchmarking |
| Advanced options/crypto derivatives streams beyond core fields | High complexity and ops burden | Only after base data quality and monitor stack is stable |

## 4) Recommended Nova Quant Data Integration Sequence

1. **Stage A: Activate public crypto feeds first**
- Implement Binance + Bybit + Deribit market adapters.
- Build funding/OI/basis/liquidity feature tables and freshness checks.

2. **Stage B: Activate Polygon equities baseline**
- Integrate REST snapshots and reference metadata.
- Add websocket for intraday event updates.

3. **Stage C: Add options expansion**
- Integrate Polygon options channels and normalize options-linked fields.

4. **Stage D: Harden data governance**
- Version source mappings and endpoint contracts.
- Add null-spike, stale-feed, and schema-drift alerts.

## 5) Fallback Strategy (When Data Is Limited)

1. Use **existing MOCK_DATA snapshots** for UI/demo continuity.
2. Prefer **public crypto endpoints** to keep discovery and diagnostics running even without paid equity plans.
3. Run discovery/validation cycles in “data-limited mode” with explicit confidence reductions.
4. Block strategy promotion if key upstream data freshness contracts fail.

## 6) Activation Checklist

- [ ] Source credentials provisioned (where required)
- [ ] Endpoint contract mapped to Nova Quant schema
- [ ] Freshness checks added
- [ ] Missingness/null spike alerts added
- [ ] Rate-limit/backoff policy implemented
- [ ] Market-closed vs crypto-24/7 scheduling handled
- [ ] Source status exposed to research diagnostics and weekly feed

# Nova Quant Quant Research Doctrine

Last updated: 2026-03-14

## Purpose

This document turns the product's research philosophy into an explicit system doctrine instead of
leaving it as implicit team taste.

The goal is not to pretend Nova Quant already runs a fully industrial commodity + equities + crypto
execution stack. The goal is to make future research and assistant outputs follow a disciplined,
cross-asset, evidence-first direction.

## Core Direction

Nova Quant should evolve into an AI-native quant research platform that can:

- study economically grounded factors,
- compare strategies under different regimes,
- evaluate portfolio construction realism,
- explain evidence and uncertainty clearly,
- preserve failed experiments as knowledge,
- stay honest about what is simulated, unavailable, or not yet implemented.

## Market Scope Doctrine

Priority target scope:

1. commodity futures
2. US equities
3. crypto

Current runtime reality:

- live runtime/API support is currently strongest for US equities, options, and crypto
- commodity futures are still a research/expansion target, not a claimed live runtime capability

This distinction is important. The doctrine should guide the architecture without creating false
product claims.

## Strategy Doctrine

- Risk control is a hard constraint, not a post-hoc patch.
- Core factor research must be economically grounded.
- Trend and arbitrage logic should be integrated through shared evidence and state, not stitched together as static sleeves.
- Signal generation is not enough; signal-to-portfolio mapping must remain explainable.
- Execution realism, turnover, cost drag, and capacity must be considered part of the research loop.

## Research Red Lines

Nova Quant research outputs must not:

- fabricate live trading or broker/exchange connectivity
- present simulated outcomes as realized truth
- present beautiful backtests as sufficient evidence
- use retail indicators such as MA / RSI / MACD as primary factor research
- ignore transaction costs, turnover, or slippage when claiming deployability

## Assistant Doctrine

When the canonical assistant is in research mode, it should:

- lead with evidence and uncertainty
- separate measured evidence from taxonomy knowledge
- propose the next research step
- avoid sounding more certain than the data supports
- explain when an idea is not yet worthy of backtest, replay, or paper

## Current Boundaries

Nova Quant still needs additional work before this doctrine is fully operationalized:

- factor-level IC / rank-IC / quantile-spread persistence
- formal PBO / deflated Sharpe style diagnostics
- deeper commodity futures runtime support
- stricter schema-based tool calling
- richer experiment lineage from hypothesis -> template -> validation -> ship/reject

The doctrine is therefore both:

- a current assistant/research constraint
- a roadmap for future engineering

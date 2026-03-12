# Prompts for Codex

## Prompt 1: Add funnel instrumentation
You are working inside a consumer AI quant product for US equities and crypto. Your task is to add end-to-end signal funnel instrumentation without breaking existing product behavior.

Requirements:
- Add counters for universe_total, post_liquidity, regime_pass, score_pass, risk_pass, conflict_pass, order_submitted, order_filled, round_trip_completed
- Persist a primary no_trade_reason
- Add shadow_opportunity logs for near-threshold candidates
- Keep code modular and minimally invasive
- Update tests and docs
- Return a short migration note and verification checklist

## Prompt 2: Replace hard gating with scoring
Refactor the signal engine so that only a small number of conditions remain hard gates. Convert the rest of the eligibility logic into a score-based framework that can reduce size or confidence instead of blocking trades entirely.

Requirements:
- preserve existing behavior where possible
- expose weights/configs clearly
- log score contributions by feature
- maintain full auditability
- provide before/after comparison on historical data

## Prompt 3: Build validation runner
Implement a validation runner with walk-forward, regime-sliced, and cost-sensitive evaluation.

Outputs required:
- markdown summary
- machine-readable JSON metrics
- promotion recommendation
- warnings if trade count is too low or results are too regime-specific

## Prompt 4: Build Copilot Console contract
Refactor the AI assistant so all outputs conform to the fixed contract: Verdict / Plan / Why / Risk / Evidence.

Rules:
- no generic chat style
- no jargon in default layer
- every plan must include entry, stop, target, size, and invalidation
- output must be renderable as structured cards

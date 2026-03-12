> Archived / Historical
> Archived on: 2026-03-09
> Applicable snapshot: pre-credibility-cleanup review cycle
> This file is retained for traceability and does not represent current system status.

# Nova Quant Global Review — Product Decision Layer Status

As of 2026-03-08.

## Scope
- opportunity objects
- risk decision objects
- regime objects
- AI copilot output structure
- product-facing decision quality

## 1) Opportunity Objects
**Current state**
- Implemented via feature/signal layer.
- Opportunity objects include: asset/market/direction, strategy family/template, entry/stop/targets, suggested size, risk bucket, conviction, rationale, invalidation, and lineage.

**Assessment**
- Object contract quality is strong for early stage.

## 2) Risk Decision Objects
**Current state**
- Trade decisions include allow/reduce/block, reason arrays, budget status context, and explainability text.

**Assessment**
- Strong traceability and UX compatibility.

## 3) Regime Objects
**Current state**
- Regime state includes primary/combined regime, posture, sizing multiplier, confidence, transition history, and warnings.

**Assessment**
- Good inspectability and policy coupling.

## 4) AI Copilot Output Structure
**Current state**
- AI page and research copilot both produce structured outputs (verdict/reasons/action/next-step patterns and evidence references).
- Copilot integrates funnel/shadow/validation/governance/portfolio diagnostics.

**Assessment**
- Better than generic chat wrappers; has real system-context grounding.

## 5) Product-Facing Decision Quality
**What is strong**
- Decision hierarchy for users is clear (conclusion -> action -> explanation).
- Holdings-specific recommendations add real user relevance.
- No-trade and size-down guidance are explicit.

**What is weak**
- Decision objects are strong structurally, but many upstream metrics are still model/simulation heavy.
- This creates a credibility gap between product polish and empirical robustness.

## Verdict
Front-end decision quality is now **well-structured and genuinely explainable**, but long-term trust depends on upgrading upstream realism (data, fills, cost, walk-forward evidence quality).

# AI Research Copilot

Last updated: 2026-03-08

## Purpose

AI Research Copilot is a research-side intelligence layer that converts diagnostics into actionable research guidance.

It does not generate vague commentary. It inspects research outputs and emits structured suggestions.

## Module

- Runtime implementation: `src/research/copilot/aiResearchCopilot.js`
- Review-layer entrypoint: `research/copilot/index.js`
- Research core output key: `research.research_core.ai_research_copilot`

## Inputs Analyzed

- signal funnel diagnostics
- shadow opportunity log
- walk-forward validation summary
- strategy governance degradation signals
- strategy discovery diagnostics
- regime state
- portfolio simulation diagnostics

## Output Structure

Copilot emits:

- `research_insights`
- `hypothesis_suggestions`
- `strategy_improvement_suggestions`
- `regime_coverage_warnings`
- `validation_warnings`
- `top_actions`

Each insight includes:

- severity
- title
- message
- evidence references

## Example Suggestion Types

- signal starvation under strict funnel thresholds
- over-strict filtering from shadow missed-opportunity ratio
- fragile strategies failing walk-forward robustness
- regime coverage gaps in discovery promotions
- low diversification and elevated drawdown in portfolio simulation

## How Researchers Should Use It

1. Review `top_actions` first.
2. Validate each action against referenced diagnostics.
3. Convert selected actions into bounded weekly experiments.
4. Record outcomes in weekly research report.

## Boundaries

- Copilot suggestions are advisory and evidence-linked.
- Copilot does not bypass governance or risk controls.
- Promotion actions still require strategy governance lifecycle decisions.

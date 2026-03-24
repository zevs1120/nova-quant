# AI Quant Training Pack for Codex

This pack is designed so an AI coding agent can continuously evolve your product from a "signal app" into a real AI-driven quant research, validation, and deployment system.

## Contents

- `00_mission_and_north_star.md` — what the system is trying to become
- `01_system_architecture.md` — target architecture for research → validation → production
- `02_data_contracts.md` — canonical data schemas and conventions
- `03_strategy_factory_spec.md` — how candidate strategies should be generated
- `04_validation_and_anti_overfit.md` — walk-forward, cost-sensitive, regime-sliced validation
- `05_release_governance.md` — DRAFT → SHADOW → CANARY → PROD
- `06_signal_funnel_and_debugging.md` — diagnose why trade density is too low
- `07_copilot_output_contract.md` — fixed structured output for AI assistant / copilot
- `08_coding_backlog_12_weeks.md` — execution roadmap
- `09_prompts_for_codex.md` — reusable prompts for coding agents
- `10_repo_layout_recommendation.md` — suggested repository layout
- `11_official_reference_stack.md` — current external tools/docs worth aligning to
- `12_kpis_and_truth_metrics.md` — what to track internally
- `13_guardrails_and_disclaimers.md` — product/risk/compliance guardrails

## How to use

This repository already vendors the pack at **`docs/quant_ai_pack/`** (this directory).

1. Point coding agents at `docs/quant_ai_pack/` plus `docs/REPOSITORY_OVERVIEW.md` for ground truth paths.
2. Treat these files as the product and research constitution alongside `docs/QUANT_RESEARCH_DOCTRINE.md`.
3. Work in small PR-sized chunks with explicit acceptance criteria.
4. Require major changes to update validation, audit logs, and docs together.

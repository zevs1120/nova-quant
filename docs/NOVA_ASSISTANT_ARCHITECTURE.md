# Nova Assistant Architecture

Last updated: 2026-03-23

## Goal

Nova Quant now exposes a single canonical assistant path.

User-facing surfaces:
- AI tab / Ask Nova page
- Ask Nova shortcuts from Today / Holdings / other pages
- ChatAssistant sheet UI (if opened)

All of these route through:
- `POST /api/chat`

The same canonical assistant can now operate in three modes:
- `general-coach`
- `context-aware`
- `research-assistant`

## Core Flow

1. Frontend sends:
- `userId`
- `threadId` (if an existing conversation exists)
- `message`
- page-aware context (`market`, `assetClass`, `signalId`, `symbol`, `riskProfileKey`, `uiMode`)

2. Backend assistant service:
- restores or creates a chat thread
- loads recent messages from `chat_messages`
- builds evidence-aware context with `src/server/chat/tools.ts`
- assembles a compact prompt with `src/server/chat/prompts.ts`
- tries providers in configured order
- falls back across timeout / network / malformed / empty / rate-limit failures
- degrades honestly to deterministic internal guidance if no provider succeeds

For research-heavy questions, the assistant now also pulls from:
- `src/server/research/knowledge.ts`
- `src/server/research/tools.ts`

That lets the same Nova Assistant answer research questions about:
- factor definitions
- factor interactions
- regime fit
- strategy metadata
- strategy evaluation reports
- validation report objects
- experiment history / failed ideas
- research workflow next steps
- backtest integrity
- turnover / cost realism
- failed experiments
- signal-level evidence

3. Backend persists:
- `chat_threads`
- `chat_messages`
- `chat_audit_logs`

4. Frontend restores:
- most recent thread
- thread messages
- current thread id in local storage

## Why This Replaced The Old Split

Before this upgrade, the product effectively had two AI paths:
- local deterministic frontend retrieval
- backend provider-backed chat

That created a "two brains" problem.

Now:
- deterministic retrieval still exists,
- but only as a backend tool / fallback source,
- so the user sees one Nova Assistant instead of two inconsistent systems.

## Research-Assistant Mode

Nova enters `research-assistant` mode for prompts involving topics such as:

- factor research
- strategy comparison
- regime behavior
- backtest integrity / overfitting
- turnover / cost realism
- portfolio construction questions
- failed experiments / research recap

In this mode, prompt assembly changes from plain product coaching to:

- evidence-first context
- factor / regime / strategy knowledge
- validation realism emphasis
- next-step research guidance

The expected answer structure is:
- `VERDICT`
- `PLAN`
- `WHY`
- `RISK`
- `EVIDENCE`

And the assistant should explicitly say whether a line of thought is worth:
- more desk research
- backtest
- replay
- paper

## Research Tool Inventory

Current research tools include:
- `get_factor_catalog`
- `get_factor_definition`
- `get_factor_interactions`
- `get_factor_measured_report`
- `get_factor_research_snapshot`
- `get_strategy_registry`
- `get_regime_taxonomy`
- `get_regime_diagnostics`
- `run_factor_diagnostics`
- `compare_factor_performance_by_regime`
- `get_strategy_evaluation_report`
- `get_validation_report`
- `get_backtest_integrity_report`
- `get_turnover_cost_report`
- `get_signal_evidence`
- `explain_why_signal_exists`
- `explain_why_no_signal`
- `get_experiment_registry`
- `get_research_memory`
- `get_research_workflow_plan`
- `list_failed_experiments`
- `summarize_research_on_topic`

See also:
- `docs/RESEARCH_ASSISTANT_TOOLS.md`

## Honesty Rules

- If a provider is unavailable, Nova says so.
- If exact signal data is missing, Nova downgrades to general guidance.
- If runtime data is insufficient, Nova says the evidence is incomplete.
- If a factor can only be described from taxonomy knowledge, Nova must say that measured factor evidence is not yet available.
- Nova does not invent live broker access, realized returns, or executed trades.

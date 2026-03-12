# Session Handoff Protocol

Last updated: 2026-03-08

## Objective

Ensure every major implementation block leaves enough context for instant continuation in the next Nova Quant session.

## Mandatory Updates Per Major Block

After each major implementation block, update at minimum:
- `docs/PROJECT_MEMORY.md`
- `docs/IMPLEMENTATION_LOG.md`
- `docs/RESEARCH_LOG.md`
- `docs/NEXT_STEPS.md`

Also update any affected domain docs (for example `STRATEGY_REGISTRY.md`, `ASSUMPTIONS.md`, `SIGNAL_FUNNEL.md`, `DATA_CONTRACTS.md`) if contracts or behavior changed.

## Required Block Summary Content

Each block log should include:
1. What was implemented
2. Files created/modified
3. Architectural decisions
4. Verification run (`test`/`typecheck`/`build` or equivalent)
5. Remaining gaps / risks
6. Immediate next actions

## Quality Rule

Do not close a major block without a handoff-quality log update.
Code-only completion is considered incomplete.


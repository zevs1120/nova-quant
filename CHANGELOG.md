# CHANGELOG

All notable changes to NovaQuant are recorded here.

## 4.0.0 (2026-03-16)
- Release type: major
- Completely rebuild the home screen into an Apple Fitness-inspired action surface with a dark energized palette, a dominant hero decision card, ring-based state cues, a pace selector, and simplified coach-first follow-through so the product no longer reads like a finance dashboard.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 3.1.0 (2026-03-16)
- Release type: minor
- Redesign the AI tab to align much more closely with ChatGPT mobile: remove the intro card, turn the empty state into a centered prompt stage, keep 'what to ask' as lightweight prompt chips, simplify the top bar, and make the thread and composer feel like a native chat product.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 3.0.0 (2026-03-16)
- Release type: major
- Rebuild the home screen into a bold, Apple Fitness-inspired action panel with a single hero command card, ring-based state cues, and a stronger consumer decision coach feel. Remove the extra perception card from the top fold so the first screen lands on today's call immediately.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 2.5.2 (2026-03-16)
- Release type: patch
- Remove the persistent top status layer and recast the Today screen around a stronger action stance, coach-style plan pills, and a cleaner follow-through card so the app feels less like a finance panel and more like a decisive consumer product.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 2.5.1 (2026-03-16)
- Release type: patch
- Remove the always-visible mode selector from daily surfaces, stop exposing mode in the status bar, and simplify More copy so the app feels less like a configurable finance tool and more like an opinionated consumer product.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 2.5.0 (2026-03-16)
- Release type: minor
- Reframe the app as a consumer decision coach: simplify Today into a stronger action-first panel, replace emoji-like financial affordances with cleaner navigation cues, soften Signal cards, and refresh AI/onboarding surfaces to feel more approachable and habit-forming without changing core functionality.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 2.4.0 (2026-03-16)
- Release type: minor
- Refresh the UI design system with a warmer premium palette, stronger component tokens, polished mobile navigation chrome, elevated card styling, and more approachable yet disciplined interaction states inspired by Composer and Duolingo.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 2.3.0 (2026-03-16)
- Release type: minor
- Standardize iOS-style navigation by removing duplicate top bars in More, introducing native-feeling back treatment for nested views, and unifying signal detail back behavior across Today and Signals.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 2.2.1 (2026-03-15)
- Release type: patch
- Remove redundant Ask Nova and About buttons from the top bar
- Updated release metadata, build number, About runtime source, and changelog entry.

## 2.2.0 (2026-03-15)
- Release type: minor
- Rework the front-end shell, Today hierarchy, and More surfaces for a stronger product-grade decision experience
- Updated release metadata, build number, About runtime source, and changelog entry.

## 2.1.1 (2026-03-15)
- Release type: patch
- Fix blank page caused by App render-order TDZ in Today boot sequence
- Updated release metadata, build number, About runtime source, and changelog entry.

## 2.1.0 (2026-03-15)
- Release type: minor
- Add decision-intelligence data model scaffolding across types, schema, and repository, while restoring Vercel availability by bypassing local Ollama in serverless runtimes.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 2.0.2 (2026-03-15)
- Release type: patch
- Restore Vercel availability by bypassing local Ollama in serverless runtimes and falling back immediately to deterministic evidence-backed responses.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 2.0.1 (2026-03-14)
- Release type: patch
- Hardened version management into a single package.json-driven release flow with generated runtime metadata.
- Added version:current, README sync, changelog summaries, and About/runtime version consistency updates.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 2.0.0 (2026-03-14)
- Release type: major
- Moved Nova onto a single-machine Apple Silicon local stack via Ollama at `http://127.0.0.1:11434/v1`.
- Added a unified local task router for `Nova-Core`, `Nova-Scout`, and `Nova-Retrieve`, then wired Today Risk, daily stance, action-card language, wrap-up, and assistant answers through that local layer.
- Added `nova_task_runs` and `nova_review_labels`, plus review-label and MLX-LM export paths so local usage can become supervised training data.
- Added local runtime APIs, a training export script, local-stack documentation, and test-time SQLite worker isolation so the product remains usable and verifiable on one Mac.

## 1.0.0 (2026-03-15)
- Release type: major
- Added a professional backend backbone that unifies research, risk governance, decision, portfolio allocation, evidence review, local Nova LLM ops, workflows, registries, and observability.
- Added canonical backend domain contracts plus a new `/api/backbone/summary` inspection surface for institutional-grade architecture visibility.
- Added local-first Nova model routing, prompt/model registries, durable workflow blueprints, audit-event tracing, scorecards, and feature-platform contracts without pushing the frontend toward terminal-style complexity.
- Added open-source borrow mapping, architecture, compliance, and implementation-truth documentation for diligence-ready provenance.

## 0.3.0 (2026-03-15)
- Release type: minor
- Added a backend-generated perception layer so the product can express “system first, user confirms” with real state rather than decorative UI copy.
- Upgraded the Today first fold with a decision-presence strip that makes the product feel more like a judgment surface and less like a dashboard.
- Extended the copy operating system, engagement snapshot, assistant context, and docs to support category-level perception differentiation.

## 0.2.0 (2026-03-15)
- Release type: minor
- Added a unified copy operating system with a shared brand voice constitution, tone matrix, guardrails, and state-to-copy selectors.
- Wired the shared copy system into the decision engine, engagement engine, Today surface, and Nova Assistant prompt layer.
- Added engineering-ready copy documentation and regression tests for tone, no-action completion, notifications, widgets, and assistant voice.
- Introduced a lightweight version management system with a single frontend/backend version source, build number support, About page version display, and reusable bump scripts.

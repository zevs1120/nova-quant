# Nova Assistant Architecture

Last updated: 2026-03-14

## Goal

Nova Quant now exposes a single canonical assistant path.

User-facing surfaces:
- AI tab / Ask Nova page
- Ask Nova shortcuts from Today / Holdings / other pages
- ChatAssistant sheet UI (if opened)

All of these route through:
- `POST /api/chat`

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

## Honesty Rules

- If a provider is unavailable, Nova says so.
- If exact signal data is missing, Nova downgrades to general guidance.
- If runtime data is insufficient, Nova says the evidence is incomplete.
- Nova does not invent live broker access, realized returns, or executed trades.

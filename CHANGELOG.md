# CHANGELOG

All notable changes to NovaQuant are recorded here.

## 10.3.3 (2026-03-24)
- Release type: patch
- Fix 12 pre-existing TypeScript strict-mode errors across 4 test files; `tsc --noEmit` now passes cleanly.
  - `tests/riskGovernorEdgeCases.test.ts`: add `as const` to `asset_class` literal in `makeHolding` helper to satisfy `AssetClass` union type (resolves 10 errors).
  - `tests/controlPlaneStatus.test.ts`: add non-null assertion on `recentNewsItem` after `.find()` (TS18048).
  - `tests/decisionEngineEdgeCases.test.ts`: add 8 missing required `MarketStateRecord` properties (`market`, `symbol`, `timeframe`, `snapshot_ts_ms`, `temperature_percentile`, `event_stats_json`, `assumptions_json`, `updated_at_ms`) to `makeMarketState` helper; `market` uses `as const` for `Market` union (TS2740).
  - `tests/massiveIngestion.test.ts`: use double-cast `as unknown as Record<string, unknown>` for test-only `delete` operation (TS2352).
- Test suite: 102/102 files pass, 591/591 tests pass (unchanged).

## 10.3.2 (2026-03-24)
- Release type: patch
- Add `CLAUDE.md` project instructions for Claude Code: build commands, code style, testing guidelines, commit conventions, environment setup.
- Add Prettier (`.prettierrc`, `.prettierignore`) with 2-space indent, single quotes, trailing commas to match existing codebase style. New `format` and `format:check` npm scripts.
- Add `.claude/settings.json` with two PostToolUse hooks: auto-format via Prettier on Write/Edit, and per-file typecheck feedback on `.ts/.tsx` edits.
- Add `.claude/skills/verify/SKILL.md`: on-demand `/verify` skill that runs the full lint+typecheck+test+build gate.
- Add `.claude/skills/dev/SKILL.md`: on-demand `/dev` skill with prerequisites checklist for starting the local development stack.

## 10.3.1 (2026-03-24)
- Release type: patch
- Create `architecture.md` at project root: comprehensive 18-section architecture overview generated from full codebase scan, covering monorepo topology, tech stack, directory structure, data flow pipeline, all 38 backend modules, 29 frontend components, 11 quant engines, data ingestion connectors, Alpha discovery system, Marvix LLM runtime, admin dashboard, database architecture, deployment, testing, environment variables, and documentation index.
- Audit 10 key documentation files against current codebase and update 5 that were outdated:
  - `docs/SYSTEM_ARCHITECTURE.md`: add Massive.com as primary ingestion source, Auth layer (Postgres/Redis/SQLite), Holdings Import, News layer (provider + Gemini factor extraction), and Admin/LiveOps layer.
  - `docs/RUNTIME_DATA_LINEAGE.md`: add Massive.com as primary API for US+Crypto, Postgres auth store lineage, holdings import lineage, Binance derivatives connector, and normalization pipeline.
  - `docs/REPO_RUNBOOK.md`: add `MASSIVE_API_KEY` and `DATABASE_URL` to prerequisites, new Postgres auth section with migration command, fix quality gates to `npm test` + `npm run verify`.
  - `docs/TECHNICAL_DUE_DILIGENCE_GUIDE.md`: add Massive.com, Postgres auth store, and holdings import to "What Is Real" section; update honest limitations to reference Massive API key dependency.
  - `docs/MARVIX_SYSTEM_ARCHITECTURE.md`: add Massive.com REST API as primary data source ahead of legacy Stooq/Binance fallbacks.
- 5 docs confirmed accurate and unchanged: `NOVA_ASSISTANT_ARCHITECTURE.md`, `DECISION_ENGINE.md`, `ENGAGEMENT_SYSTEM.md`, `REPOSITORY_OVERVIEW.md`, `VERSIONING.md`.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 10.3.0 (2026-03-24)
- Release type: minor
- Integrate Massive.com (formerly Polygon.io) REST API as a new data source for US equities and crypto OHLCV bars.
- New `src/server/ingestion/massive.ts`: implements `backfillMassiveStocks` and `backfillMassiveCrypto` with v2 aggregates endpoint, built-in pagination via `next_url`, 429 rate-limit handling (15s backoff), network timeout retry with exponential backoff, and Binance→Massive crypto symbol conversion (`BTCUSDT` → `X:BTCUSD`).
- Add `massive` configuration block to `AppConfig` type and `config.ts` defaults: `MASSIVE_API_KEY` env var, 12s rate-limit delay (Basic tier), 365-day default lookback, 3 retry attempts.
- Add `MASSIVE_API_KEY` placeholder to `.env` and `.env.example`.
- New `tests/massiveIngestion.test.ts` (34 tests): pure function tests (mapTimeframe, convertCryptoSymbol, massiveBarToNormalized with decimal precision), fetchMassiveAggs integration tests (happy path, empty results, undefined results, pagination, 429 retry, 403/401/500/503 error handling, network timeout, invalid JSON, apiKey injection on next_url), backfill graceful skip tests, and full data pipeline round-trip tests (stock/crypto fetch→normalize→upsert→getOhlcv, upsert idempotency, upsert overwrite, getLatestTsOpen).
- New `scripts/massive-smoke-test.ts` (38 real-API assertions): multi-ticker validation (AAPL, SPY, MSFT, X:BTCUSD, X:ETHUSD), OHLC data integrity invariants (high≥all, low≤all, volume≥0), time continuity checks (sorted, no duplicates, no gap anomalies), invalid ticker handling, and complete DB round-trip verification via getOhlcv/getLatestTsOpen/getOhlcvStats with idempotency proof.
- Test suite: 102/102 files pass, 591/591 tests pass (up from 101/101 files and 557/557 tests).

## 10.2.4 (2026-03-24)
- Release type: patch
- Add 82 high-quality tests across 4 new test files targeting weak-coverage pure-logic modules and the manual (loyalty/gamification) service.
- New `timeUtilsEdgeCases.test.ts` (27 tests): `timeframeToMs` for all 5 timeframes + unsupported throw, `toMsUtc` with number/Date/ISO/numeric-string/invalid-throw, `isoToMs` edge cases, `floorToTimeframe` alignment, `monthRange` including year boundaries and reversed ranges, `dayRange` with month boundaries and zero-count.
- New `multiAssetSchemaEdgeCases.test.ts` (27 tests): constant enums (ASSET_CLASS, DATA_STATUS, FREQUENCY), REQUIRED_FIELDS contract for all 8 entity types, `buildProvenance` field mapping, `createAssetId` format, `safeNumber` for NaN/Infinity/null/undefined, `toIsoDate` extraction, `toIsoTimestamp` with/without timezone.
- New `confidenceCalibrationEdgeCases.test.ts` (10 tests): empty-history calibrator summary, full signal calibration field contract, confidence clamping [0.01-0.99], calibrated range [0.18-0.94], monotonicity with no history, execution history with 12/24 samples, filter logic (DONE/CLOSE only, missing signal skip).
- New `manualServiceEdgeCases.test.ts` (19 tests): guest auth guards (5 variants), default dashboard shape (summary/referrals/rewards/rules/ledger), FK-guard for non-existent users, VIP redemption guards, referral claim guards (empty code, invalid code), prediction entry guards (empty marketId/selectedOption, non-existent market).
- Fix pre-existing flaky `controlPlaneStatus.test.ts`: replaced `[0]` index-based assertions with `.find()` lookups by unique symbol/market. Root cause: parallel tests seed competing workflow runs and news items that shift ordering in `ORDER BY updated_at_ms DESC LIMIT 6` results, pushing seeded data out of position `[0]`.
- Test suite: 101/101 files pass, 557/557 tests pass (up from 97/97 files and 475/475 tests).

## 10.2.3 (2026-03-24)
- Release type: patch
- Add 63 high-quality tests across 4 new test files targeting server-side decision logic, risk governance, strategy orchestration, and broker/exchange connectivity.
- New `riskGovernorEdgeCases.test.ts` (27 tests): all 8 overlay conditions (risk_off_kill_switch, macro_derisk, caution_size_cut, budget_exhausted, budget_thin, same_symbol_block/taper, sector_concentration, loss_streak_kill_switch/recovery, short_asymmetry_haircut, low_calibrated_confidence), compound multiplier stacking, edge cases (empty marketState, null riskProfile).
- New `strategyTemplatesEdgeCases.test.ts` (17 tests): 9-template catalog completeness, required field contracts, `resolveStrategyId` resolution via strategy_id / SYMBOL_TO_STRATEGY map / asset_class fallback / market fallback, `buildSignalExplanation` line count and content.
- New `decisionEngineEdgeCases.test.ts` (16 tests): output contract (today_call, risk_state, portfolio_context, summary), action card ranking, publication status, governor integration, edge cases (zero signals, empty marketState, null riskProfile, INSUFFICIENT_DATA), today_call code classification under high risk-off and healthy regime.
- New `connectAdaptersEdgeCases.test.ts` (15 tests): Alpaca/Binance credential detection (NO_CREDENTIALS, UNSUPPORTED_PROVIDER), trading flag enforcement, order validation (missing orderId, missing credentials), snapshot structure contracts, timestamp validity.
- Test suite: 97/97 files pass, 475/475 tests pass (up from 93/93 files and 412/412 tests).

## 10.2.2 (2026-03-24)
- Release type: patch
- Add 72 high-quality tests across 5 new test files targeting remaining untested engine modules.
- New `regimeEngineEdgeCases.test.ts` (9 tests): RISK_ON / NEUTRAL / RISK_OFF classification boundaries, cross-market risk snapshot clamping, primary snapshot selection, output contract verification.
- New `velocityEngineEdgeCases.test.ts` (14 tests): deterministic synthetic series generation, velocity array invariants (length, bounds, acceleration[0]=0), event study validation, BTC-USDT primary key resolution, custom featureSeries support.
- New `performanceEngineEdgeCases.test.ts` (11 tests): trade metrics for zero/all-winners/all-losers/mixed, attribution grouping by strategy_id and regime_id, backtest-live deviation decomposition, 3M vs ALL range filtering.
- New `funnelEngineEdgeCases.test.ts` (19 tests): all 13 rejection reason codes (regime_blocked, score_too_low, risk_budget_exhausted, cost_too_high, etc.), funnel counter pipeline, aggregation by market/strategy, no-trade ranking with share sums, shadow opportunity log cap and near-miss inclusion.
- New `riskGuardrailEdgeCases.test.ts` (19 tests): mega_tech / crypto_core / single_name theme classification, correlation cluster alert thresholds (MEDIUM vs HIGH severity), regime mismatch warnings, STAY_OUT / REDUCE / TRADE_OK recommendation state machine, portfolio risk budget arithmetic, signal annotation propagation.
- Fix P1 flaky `novaLocalStack` test: "bypasses local Nova in Vercel runtime" always failed in parallel because `getDecisionSnapshot` took the `shouldUsePublicDecisionFallback` early-return when `signalCount=0 && runtimeStatus=INSUFFICIENT_DATA && no holdings`. The public fallback skips `applyLocalNovaDecisionLanguage` entirely, so `summary.nova_local` was never set. Fixed by sending `holdings` in the test POST and stubbing 5 cloud API env vars (`OPENAI_API_KEY`, `NOVA_CLOUD_API_KEY`, `OPENAI_BASE_URL`, `NOVA_CLOUD_OPENAI_BASE_URL`, `NOVA_PREFER_CLOUD`) to force deterministic-fallback mode.
- Test suite: 93/93 files pass, 412/412 tests pass (up from 88/88 files and 340/340 tests).

## 10.2.1 (2026-03-24)
- Release type: patch
- Add 131 high-quality tests across 5 new test files targeting core financial calculation engines and business logic edge cases.
- New `riskEngineDeep.test.ts` (17 tests): position sizing with NaN/zero/tiny stops, risk bucket state machine transitions, daily-loss and max-drawdown circuit breakers.
- New `signalEngineScoring.test.ts` (16 tests): signal scoring under TREND vs RISK_OFF regimes, expected R for LONG/SHORT, direction-conflict muting, time-based expiry, crypto vs US cost model differences.
- New `mathEdgeCases.test.ts` (35 tests): boundary conditions for all 13 math utility functions including stdDev with constants, correlation with identical arrays, maxDrawdown scenarios, and round with non-finite inputs.
- New `tradeIntentEdgeCases.test.ts` (20 tests): defensive handling of empty/undefined signals, stop_loss resolution chain (object → value → invalidation → numeric), legacy take_profit fallback, i18n handoff labels, AI prompt generation.
- New `holdingsSourceDeep.test.ts` (27 tests): portfolio weight rebalancing (sums to 100%), merge/dedup by market:class:symbol key, live-over-manual priority, all 7 summarizeHoldingsSource status classifications, and crypto symbol inference.
- Fix P1 NaN propagation in `math.js`: `round(NaN)` returned NaN instead of 0 because `Math.round(NaN * scale)` is NaN. Added `Number.isFinite()` guard so non-finite inputs (NaN, Infinity, undefined) return 0, preventing silent corruption in position sizing and signal scoring.
- Fix P1 DERISKED bucket multiplier ineffective in `riskEngine.js`: `computePositionPct()` applied `bucketMultiplier` only to `rawPct` but not to `perSignalCap`. With tight stops, both BASE and DERISKED clamped to the same cap ceiling, making the risk bucket meaningless. Now `perSignalCap` is also scaled by `bucketMultiplier`, ensuring DERISKED always constrains positions.
- Fix P2 Postgres auth driver leaking into tests: `adminDataApi.test.ts` and `novaLocalStack.test.ts` stubbed KV/Redis env vars but not `NOVA_AUTH_DRIVER`/`SUPABASE_DB_URL`. When `.env` sets `NOVA_AUTH_DRIVER=postgres`, auth service attempted remote Supabase connections during tests, causing 500 errors. Added env stubs to force local SQLite auth store.
- Install missing `pg` package, resolving 14 test file import failures.
- Test suite: 88/88 files pass, 340/340 tests pass (up from 67/83 files and 180/182 tests).

## 10.2.0 (2026-03-24)
- Release type: minor
- Harden authentication with a full Postgres auth store (`auth_users`, `auth_sessions`, `auth_user_roles`, `auth_password_resets`, `auth_user_state_sync`), session-scoped user middleware, RBAC role system (ADMIN / OPERATOR / SUPPORT), and password reset email flow.
- Add `asyncRoute()` wrapper to all async Express handlers, fixing the Express 4 unhandled async rejection gap.
- Add session-based user scope resolution: cookie parsing, `RequestWithNovaScope` middleware, `requireAuthenticatedScope` guard, and guest-user fallback.
- Add `scripts/migrate-auth-to-postgres.ts` for one-step SQLite → Postgres auth migration.
- Add admin Research Ops dashboard (`ResearchOpsPage.jsx` + `liveOps.ts`) showing daily workflow runs, data intake counts, Alpha evaluation distribution (PASS / WATCH / REJECT), training status, top backtests, and recent signals with upstream / local-fallback data source switching.
- Add holdings import system with three data ingestion paths: CSV upload, screenshot (vision-model) upload, and read-only broker/exchange sync.
- CSV parser (`src/server/holdings/import.ts`) auto-detects delimiter (comma / semicolon / tab), maps common column aliases, infers asset class (US_STOCK / CRYPTO / OPTIONS), and normalizes weight/market-value.
- Add `src/utils/holdingsSource.js` shared utility for holdings merge, dedup (by market:class:symbol key), and market-value weight calculation.
- Expand `HoldingsTab.jsx` with CSV/screenshot upload UI, import feedback (success/warning/error), and a "most important next step" priority advice section.
- Add 6 new test files: `authScopeApi.test.ts`, `passwordResetApi.test.ts`, `signupWelcomeApi.test.ts`, `adminAuthApi.test.ts`, `holdingsImport.test.ts`, `holdingsAnalyzer.test.ts`.

## 10.1.3 (2026-03-24)
- Release type: patch
- Comprehensive code audit and bug fix sprint across 9 server-side modules (~14,000 lines reviewed).
- Fix P0 API fall-through: POST /api/decision/today with non-empty holdings no longer leaks into createApiApp(), preventing duplicate request processing and inconsistent responses.
- Fix P0 timer leak: withTimeout() in chat streaming now clears setTimeout handles in a finally block, preventing memory pressure under load.
- Fix P1 hardcoded options expiry: replace static '2026-06-21' with dynamic computeNearestFridayExpiry() for accurate DTE calculations.
- Fix P1 FK ordering: move decision_snapshots table creation before recommendation_reviews in schema.ts to satisfy foreign key constraints.
- Fix P1 signal conflict mutation: resolveConflicts() in signalEngine.js now returns new objects via spread instead of mutating inputs.
- Fix P2 NaN propagation: add safeNum() guards in signalEngine.js to prevent NaN scores from breaking signal ranking.
- Fix P2 Date sort: use .getTime() instead of implicit Date subtraction in sort comparator.
- Fix P2 JSON parse guard: wrap unguarded event_stats_json parse in decision/engine.ts with try-catch.
- Fix P2 Express error middleware: add global app.use error handler to prevent requests from hanging on unhandled sync errors.
- Fix P3 locale hardcode: wrapUp.lessons in engagement/engine.ts now respects locale parameter instead of always producing Chinese text.
- Fix P3 chat history waste: reduce MAX_HISTORY_TURNS from 8 to 4 to match actual historyToProviderMessages usage.
- Fix P3 auth seed guard: gate ensureSeededUserLocal() with a module-level flag to avoid redundant INSERT on every DB read.
- Fix pre-existing TS error: add allowBackgroundStrategyRefresh to ensureQuantData parameter type in quant/service.ts.

## 10.1.2 (2026-03-24)
- Release type: patch
- Resolve all 11 npm audit vulnerabilities (4 moderate, 7 high) by adding npm overrides for transitive dependencies: undici ^6.24.1, ajv ^8.18.0, minimatch ^10.2.4, path-to-regexp ^8.3.0, esbuild ^0.27.4.
- Affected parent packages: @vercel/node (undici, ajv, minimatch, path-to-regexp) and vite (esbuild). No breaking changes to direct dependencies.
- Fix 12 failing tests across 9 test files by adding env isolation (vi.stubEnv) for LLM provider keys (GROQ_API_KEY, GEMINI_API_KEY) and remote auth store credentials (KV_REST_API_URL, KV_REST_API_TOKEN, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN). Tests now pass consistently with or without .env credentials present.
- Update apiIndexRoute CORS assertion from GET,OPTIONS to GET,POST,OPTIONS to match current applyPublicCors handler.
- Fix manual service 500 crash for cloud-only auth users: gracefully handle FOREIGN KEY constraint failure in ensureManualUserState when user exists in remote auth store (Upstash Redis) but not in local SQLite auth_users table. Returns default dashboard instead of crashing.
- Fix duplicate React key warning in BrowseTab Earnings section: todaySignalSymbols can contain multiple signals for the same symbol (e.g. TSLA, META), causing `signal-${symbol}` key collisions. Added array index to disambiguate.
- Code-split 10 tab components via React.lazy (AiPage, BrowseTab, HoldingsTab, MarketTab, MenuTab, OnboardingFlow, ProofTab, ResearchTab, RiskTab, SignalsTab, WeeklyReviewTab). Main JS bundle reduced from 717 KB to 331 KB (54% reduction), eliminating Vite chunk size warning. TodayTab remains static for zero-delay first paint.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 10.1.1 (2026-03-23)
- Release type: patch
- Normalize documentation against the repo: monorepo deploy layout, local dev (npm ci, npm run dev stack), REPOSITORY_OVERVIEW/REPO_RUNBOOK/VERSIONING cross-links.
- Replace stale absolute-path links in research/copy/decision indexes; clarify api/, admin/, model/ READMEs; align SYSTEM_ARCHITECTURE tabs and TECHNICAL_DUE_DILIGENCE_GUIDE with optional LIVE routing and honest defaults.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 10.1.0 (2026-03-20)
- Release type: minor
- Promote execution drift monitoring into research and portfolio governance, and add a unified local dev stack plus richer Browse detail/feed surfaces.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 10.0.2 (2026-03-20)
- Release type: patch
- Surface evidence mode, execution boundary, and risk gate directly in Today and Proof by default.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 10.0.1 (2026-03-19)
- Release type: patch
- Add institutional-readiness gates to strategy governance and make runtime-state API tests independent of sandbox port binding.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 10.0.0 (2026-03-19)
- Release type: major
- Separate live, paper, replay, backtest, and demo evidence modes across the runtime, decision, and proof surfaces.
- Add confidence calibration, portfolio-level risk governor, and news context to the decision pipeline.
- Isolate demo mode from the production path so demo state no longer contaminates real user flows.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 9.4.1 (2026-03-19)
- Release type: patch
- Isolate demo mode from the production path and add explicit Today/Proof provenance labels and watermarks so live, paper, backtest, and demo evidence do not blur together.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 9.4.0 (2026-03-19)
- Release type: minor
- Harden the production path by isolating demo mode to a small Menu entry and preventing demo state from syncing into real user flows.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 9.3.0 (2026-03-18)
- Release type: minor
- Make Browse feel closer to Robinhood discovery: search results now open a native asset detail screen, users can add symbols to Watchlist from search, and stock/crypto ranking now prioritizes company and coin-name matches. Also refresh the installed app icon set with the NOVA3 artwork.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 9.2.1 (2026-03-18)
- Release type: patch
- Refresh the installed app icon set to use the new NOVA3 artwork for apple-touch-icon and PWA home-screen icons.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 9.2.0 (2026-03-18)
- Release type: minor
- Turn Browse into a real market search surface by merging external stock and crypto search providers with the existing live asset pool. Also fail fast when deployed auth cannot reach its remote store and surface a clearer login error.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 9.1.1 (2026-03-18)
- Release type: patch
- Fail fast when deployed auth cannot reach the remote session store and surface a clearer login error.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 9.1.0 (2026-03-18)
- Release type: minor
- Add real Browse search for stocks and crypto using live assets plus extended fallback universes.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 9.0.0 (2026-03-18)
- Release type: major
- Split deployed auth into lightweight Vercel handlers backed by a persistent Redis-compatible store.
- Keep SQLite auth for local development while requiring a real remote auth store on internet deployments.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 8.0.2 (2026-03-18)
- Release type: patch
- Fix bottom-tab navigation being reset by auth session hydration.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 8.0.1 (2026-03-18)
- Release type: patch
- Clarify login failures by separating invalid credentials from offline local auth service.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 8.0.0 (2026-03-18)
- Release type: major
- Add SQLite-backed auth, session cookies, password reset, and synced user state.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 7.1.0 (2026-03-18)
- Release type: minor
- Add local demo authentication with a seeded test account and real login/logout flow.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 7.0.0 (2026-03-18)
- Release type: major
- Rebuild onboarding into a four-scene editorial intro and a quieter three-step sign up flow.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 6.1.0 (2026-03-18)
- Release type: minor
- Turn Points Hub into a full platform rewards home with balance hero, game and invite actions, VIP redemption, activity, and rules.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 6.0.0 (2026-03-18)
- Release type: major
- Refactor navigation into Today, Nova, Browse, and My with a full-screen Menu and Points Hub.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 5.1.1 (2026-03-18)
- Release type: patch
- Use real historical bars for Holdings demo curves whenever market data is available
- Updated release metadata, build number, About runtime source, and changelog entry.

## 5.1.0 (2026-03-18)
- Release type: minor
- Redesign the Holdings page around a Robinhood-style portfolio overview and a lighter NovaQuant list surface
- Updated release metadata, build number, About runtime source, and changelog entry.

## 5.0.1 (2026-03-18)
- Release type: patch
- Fix Today page white screen caused by undefined conviction value
- Updated release metadata, build number, About runtime source, and changelog entry.

## 5.0.0 (2026-03-17)
- Release type: major
- Rebuild the Today screen around a single-glance decision layout
- Updated release metadata, build number, About runtime source, and changelog entry.

## 4.6.0 (2026-03-17)
- Release type: minor
- Refactor Today, Holdings, and More into lighter native-feeling mobile surfaces while keeping the AI tab in a ChatGPT plus iMessage conversation style.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 4.5.2 (2026-03-17)
- Release type: patch
- Refine the home tab bar into a slimmer, more native-feeling mobile navigation with lighter glass and subtler active states.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 4.5.1 (2026-03-17)
- Release type: patch
- Redesign the home hero ring row for mobile readability, improving ring contrast and separating MOVE / SIZE / RISK labels from Ready / Light / Low states.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 4.5.0 (2026-03-17)
- Release type: minor
- Turn the home hero into a swipeable two-page card, moving the action card into the second page and adding a scroll-condensing top bar that crossfades into the Nova2 logo.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 4.4.0 (2026-03-17)
- Release type: minor
- Add a scroll-condensing top bar that crossfades into the Nova2 logo and tighten the home hero into a rings-first layout with compact secondary cards.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 4.3.1 (2026-03-17)
- Release type: patch
- Swap the top-bar logo to the new NOVA1 artwork while keeping the thinner header and redesigned home surface.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 4.3.0 (2026-03-17)
- Release type: minor
- Rework the home screen into a lighter pop editorial surface with a new hero card, summary header, and colorful action tiles while keeping the thinner top bar.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 4.2.6 (2026-03-16)
- Release type: patch
- Trim another 40px+ from the top bar and reduce the centered logo height for a thinner header.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 4.2.5 (2026-03-16)
- Release type: patch
- Reduce the top-bar logo scale and tighten the header height for a thinner brand bar.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 4.2.4 (2026-03-16)
- Release type: patch
- Increase the centered top-bar logo to a much larger brand-led presentation.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 4.2.3 (2026-03-16)
- Release type: patch
- Swap the top-bar logo to the updated novaquant2 artwork.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 4.2.2 (2026-03-16)
- Release type: patch
- Replace the top-bar copy with a centered Nova logo and keep only the iOS back action where needed.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 4.2.1 (2026-03-16)
- Release type: patch
- Fix the AI chat composer so it stays pinned above the tab bar instead of drifting inside the message flow.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 4.2.0 (2026-03-16)
- Release type: minor
- Rebuild the mobile AI page around a ChatGPT + iMessage conversation layout with a sticky composer, suggestion chips, and lighter assistant message structure.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 4.1.0 (2026-03-16)
- Release type: minor
- Add local Nova health checks, MLX-LM LoRA bootstrap, and first-wave training task filtering.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 4.0.1 (2026-03-16)
- Release type: patch
- Shift the rebuilt home screen back to a light Apple Fitness-inspired palette: keep the new structure and rings, but replace the dark hero and support surfaces with bright layered cards, softer cream backgrounds, and more playful multicolor accents.
- Updated release metadata, build number, About runtime source, and changelog entry.

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

# CHANGELOG

All notable changes to NovaQuant are recorded here.

## 10.5.8 (2026-03-26)

- Release type: patch
- **Fix: resolve "System offline" on Vercel cold starts by unblocking the public decision fallback.**
  - Root cause: Vercel serverless functions use an ephemeral `/tmp` SQLite database that is empty on every cold start (0 OHLCV bars). The `shouldUsePublicDecisionFallback()` function in `queries.ts` was designed to fall through to the live public market scan when the DB has no data, but it unconditionally returned `false` when the user had holdings (including investor demo or connected broker holdings). This meant any user with holdings saw a raw `UNAVAILABLE` decision code from the empty DB, which the frontend rendered as "System offline".
  - Fix: restructure `shouldUsePublicDecisionFallback()` so the "DB completely empty" condition (no signals, not DB-backed, `UNAVAILABLE` decision code) always triggers the public fallback, regardless of holdings. The holdings gate now only applies when the DB has real data — preventing the generic public scan from replacing personalized decision snapshots.
  - Also simplified the `NOVA_FORCE_PUBLIC_RUNTIME_FALLBACK` env flag to unconditionally enable fallback (previously it too was blocked by holdings).
  - Result: users on Vercel cold starts now see live public market scan results instead of "System offline". 618/618 tests pass, typecheck clean.

## 10.5.7 (2026-03-26)

- Release type: patch

- **Fix: extract OnboardingFlow CSS into eagerly-loaded global module, restoring fully styled Welcome/Login/Signup screens on first visit.**
  - Root cause: all OnboardingFlow visual styles (~490 lines — buttons, inputs, form layouts, SVG illustration fills, signup cards, broker selector, error/success messages) were defined inside `holdings.css`, which Vite code-splits into an async chunk loaded only when `HoldingsTab` or `BrowseTab` mounts. Since both require login, first-time visitors saw completely unstyled HTML for the Welcome, Login, Signup, and Password Reset screens. A prior patch (v10.5.6) duplicated only the `.onboarding-flow` positioning rule into `corrections.css`, but all other visual styles remained unreachable.
  - Fix: created `src/styles/onboarding.css` with the full OnboardingFlow CSS extracted from `holdings.css`. Added `@import './styles/onboarding.css'` to the global CSS chain (`src/styles.css`). Removed the temporary positioning patch from `corrections.css`.
  - Result: `holdings.css` code-split chunk reduced from 58 KB to 38 KB. OnboardingFlow styles now load on first paint via the global CSS bundle. 618/618 tests pass, `npm run verify` clean.

## 10.5.6 (2026-03-26)

- Release type: patch
- **Fix: resolve production layout breakage caused by CSS code-split cascade conflict.**
  - Root cause: `today-redesign.css` and `today-final.css` were imported by lazy-loaded `TodayTab.jsx`, causing Vite to code-split them into async CSS chunks (`TodayTab-*.css`, `today-redesign-*.css`). The global `index.css` already contained same-specificity selectors for `.today-action-card`, `.today-screen-native`, etc. In dev mode, Vite injects `<style>` tags in import order so the overrides always win. In production, async CSS chunks load after the global `<link>` in `<head>`, and same-specificity rules from the global stylesheet can take precedence — breaking the entire Today tab layout.
  - Fix: moved `today-redesign.css` and `today-final.css` into the global `@import` chain in `src/styles.css` (appended after `corrections.css`). Removed duplicate imports from `src/components/TodayTab.jsx` and `src/components/DisciplineTab.jsx`.
  - Result: Today CSS chunks eliminated from build output (was 35KB across 2 async chunks); all styles now in the global bundle (197KB, up from 162KB). Zero visual regression in dev. 618/618 tests pass.
- Updated release metadata, build number, and changelog entry.

## 10.6.0 (2026-03-26)

- Release type: **minor** (new feature)
- **feat(outcome): add Decision Outcome Ledger — automated performance attribution.**
  - **Backend — Outcome Resolver (`src/server/outcome/resolver.ts`):**
    - Joins `decision_snapshots` with subsequent OHLCV data to compute T+1, T+3, T+5 forward returns.
    - Classifies each action as `HIT` (≥+0.3%), `MISS` (≤−0.3%), `INCONCLUSIVE`, or `PENDING`.
    - Correctly inverts returns for `SHORT` direction; skips `no_action`/`wait` recommendations.
    - Persists results to the existing `outcome_reviews` table via idempotent upsert.
    - Exposes aggregate stats: hit rate, resolved count, average T+1/T+3 returns.
  - **Backend — API (`src/server/api/routes/outcome.ts`):**
    - `GET /api/outcomes/recent` — returns resolved outcomes with aggregate stats for frontend.
    - `POST /api/outcomes/resolve` — triggers on-demand resolution for a specific date or lookback window.
    - Route wired into `app.ts` with CORS cross-origin read and user-scoped cache support.
  - **Backend — Auto-Backend Integration (`scripts/auto-backend.ts`):**
    - Outcome resolution runs automatically in the maintenance cycle (last 7 days, post-runtime refresh, pre-training).
    - Wrapped in try/catch with structured logging.
  - **Frontend — TodayTab (`src/components/TodayTab.jsx`):**
    - "Yesterday's Calls" card shows top 3 resolved outcomes with verdict icons (✅/❌/⬜), symbol, direction arrow, forward return %, and horizon label.
    - Positioned between the action carousel and summary grid.
    - Gracefully hidden when no outcomes are available.
  - **Frontend — ProofTab (`src/components/ProofTab.jsx`):**
    - "Outcome History" section with 4-column stats row (hit rate, resolved/total, avg T+1, avg T+3).
    - Full outcome table: date, symbol, direction, T+1/T+3/T+5 returns (color-coded), verdict.
    - Positioned after Performance Proof card.
  - **CSS — Responsive Design (`src/styles/today-final.css`):**
    - PC: 3-column outcome card grid; mobile (≤640px): single-column horizontal row layout.
    - Stats row: 4-column on desktop, 2-column on mobile.
    - Matches existing design tokens (border-radius, colors, shadows, typography).
  - **Tests (`tests/outcomeResolver.test.ts`):** 19 test cases covering HIT/MISS/INCONCLUSIVE/PENDING classification, SHORT inversion, no_action skipping, multi-action support, upsert persistence, batch resolution, aggregate stats, malformed data handling, idempotency, single-query verification, and snapshot_date correctness.
  - **Bugfix: trading-day semantics** — replaced calendar-day offset (`N * 86400000`) with bar-index-based OHLCV lookups. T+1/T+3/T+5 now correctly reference the Nth subsequent trading bar, skipping weekends and holidays. Reduces per-asset OHLCV queries from 4 to 1.
  - **Bugfix: userId scoping** — TodayTab and ProofTab now thread `effectiveUserId` (from `useAuth`) into outcome fetch URLs, preventing guest users from seeing shared/default-scope data.
  - **Bugfix: snapshot_date vs resolved_at** — the Outcome History table now displays the original decision date, not the resolver execution timestamp.

## 10.5.5 (2026-03-25)

- Release type: patch
- **Fix: resolve `Uncaught ReferenceError: now is not defined` crash in `App.jsx`.**
  - Root cause: the v10.4.2 refactor moved the 30-second `now` timer from `App.jsx` into `TodayTab`, but the `useEngagement` hook options object still referenced the bare `now` shorthand property. With no `now` variable in scope, the app white-screened on mount.
  - Fix: replace `now,` with `now: new Date(),` in the `useEngagement` call (line 239).

## 10.5.4 (2026-03-25)

- Release type: patch
- **Fix: landing page mobile layout — statement cards, Ask Nova chat, and distribution credits (`landing/`).**
  - **Statement section:** on ≤760px, switch from side-by-side grid to vertical flex layout; fan card showcase breaks out to full viewport width (`100vw`) so the interactive card stack fills the screen instead of overlapping the copy text.
  - **Ask Nova section:** on ≤760px, switch to vertical flex layout; remove restrictive `max-height` and `aspect-ratio: 16/10` constraints on the chat screenshot so it displays at natural height, filling the section.
  - **Distribution credits:** restructure JSX from separate story/credits containers into paired rows (`distribution-pair`), each row containing one "Someone who..." line alongside its corresponding name. Uses CSS subgrid for guaranteed row-level alignment across all breakpoints.
  - PC / desktop layout unchanged.

## 10.5.3 (2026-03-25)

- Release type: patch
- **CI: fix Prettier formatting failures and add pre-commit enforcement.**
  - Fix Prettier formatting on 9 files that caused CI failure: 6 landing components (`AskSection`, `DistributionSection`, `HeroSection`, `LegalFooter`, `ProofSection`, `StatementSection`), `src/App.jsx`, `src/server/api/app.ts`, `tests/performanceOptimization.test.ts`.
  - Add husky + lint-staged pre-commit hook: all staged `.js`, `.jsx`, `.ts`, `.tsx`, `.css`, `.json`, `.md` files are auto-formatted by Prettier before commit, preventing future CI formatting failures.
  - New `.husky/pre-commit` hook running `npx lint-staged`; `lint-staged` config in `package.json`.
- **Fix: resolve all npm audit vulnerabilities (5 → 0).**
  - `picomatch` (high, ReDoS + method injection): resolved via `npm audit fix` (updated to patched version).
  - `smol-toml` (4 moderate, DoS via commented TOML lines): added `smol-toml: ">=1.6.1"` npm override to fix transitive dependency chain (`@vercel/node` → `@vercel/build-utils` → `@vercel/python-analysis` → `smol-toml`) without breaking `@vercel/node` version.
- Updated release metadata, build number, and changelog entry.

## 10.5.2 (2026-03-25)

- Release type: patch
- **Perf: frontend + backend performance optimization sprint.**
  - **CSS code-split:** moved 5 tab-specific CSS files (85 KB) from global `styles.css` into lazy component imports (`TodayTab`, `AiPage`, `HoldingsTab`, `BrowseTab`, `DisciplineTab`). Shell CSS is now 162 KB (down from 247 KB). Note: the default Today view still loads `today-redesign` (20 KB) + `TodayTab` (14 KB) async CSS on first render, so full Today first-paint CSS is ~196 KB. The savings are: (a) non-Today tabs skip Today CSS until visited, (b) AiPage/Holdings/Browse CSS (52 KB) is fully deferred, (c) CSS chunks cache independently per tab.
  - **TodayTab code-split:** moved from eager import to `React.lazy()`, reducing the main `index.js` chunk from 314 KB to 124 KB. First-paint JS is now the main chunk (124 KB) plus the vendor chunk (141 KB). TodayTab (40 KB) loads on demand. Chart.js stays inside the lazy `ProofTab` chunk (178 KB) and is not fetched until that tab is opened.
  - **Vendor splitting:** added `manualChunks` to `vite.config.js` separating `react` + `react-dom` into a `vendor.js` chunk (141 KB) that rarely changes between deploys and can be long-term cached by browsers.
  - **Clock state sunk:** moved the 30-second `now` timer from `App.jsx` into `TodayTab`, eliminating a full-tree re-render every 30 seconds when any other tab is active.
  - **Browse warmup deferred:** warmup network requests now only fire when the Browse tab is activated (previously fired on app mount regardless of active tab). Polling interval increased from 15s to 120s.
  - **Server Cache-Control:** added `Cache-Control: private, no-store` to user-scoped GET endpoints (`/api/assets`, `/api/market-state`, `/api/signals`, etc.) to explicitly prevent shared-cache leakage across sessions.
  - **i18n file split:** split 665-line inline `i18n.js` into `src/locales/en.js` and `src/locales/zh.js` for code organisation. Both packs are still statically imported.
  - **`getRepo()` singleton:** `MarketRepository` now created once instead of per-request. `closeDb()` clears the singleton to prevent stale-handle usage.
  - **`fetchApi` fast path:** cached API base is used directly without recomputing origin candidates; fallback only triggers on network failure.
  - **CORS allowlist:** replaced 18-way `||` chain with `Set.has()` for O(1) path matching.
  - New `tests/performanceOptimization.test.ts` (7 tests): Cache-Control header assertions (private/no-store on user-scoped endpoints), closeDb→getDb repo singleton lifecycle, build output chunk shape (vendor separated, TodayTab lazy, no charts modulepreload).
  - Zero logic changes. Typecheck clean, 103/103 test files, 599/599 tests pass, build OK.

## 10.5.1 (2026-03-25)

- Release type: patch
- **Refactor: decompose monolithic landing page into maintainable component architecture.**
  - `App.jsx` reduced from 804 lines to 44 lines — now a pure orchestrator composing 10 section components via props.
  - New `data/index.js` (299 lines): all 7 content arrays (pricing plans, FAQs, action cards, testimonials, credits, legal) extracted as named exports.
  - New `hooks/useStatementFan.js` (86 lines): ResizeObserver-driven card fan scaling extracted as a reusable hook.
  - New `components/` directory: `Header`, `HeroSection`, `StatementSection`, `ProofSection`, `AskSection`, `PricingSection`, `FaqSection`, `VoicesSection`, `DistributionSection`, `LegalFooter`.
  - `styles.css` (3,697 lines) split into 12 ordered CSS modules under `styles/` (base, header, hero, statement, proof, ask, pricing, faq, voices, distribution, legal, animations); each section's responsive `@media` rules co-located with its styles.
  - `styles.css` replaced with 12-line `@import` hub, matching the main app's CSS architecture pattern.
  - Zero visual regression: build output CSS 52.70 KB, JS 164.08 KB, build time unchanged.

## 10.5.0 (2026-03-25)

- Release type: minor
- **Docs: add professional-grade product document for external review.**
  - New `docs/CURRENT_PRODUCT_DOCUMENT_ZH.md` (436 lines): a comprehensive current-stage product document written for professional reviewers, advisors, and institutional evaluators.
  - Covers execution summary, product boundary definition, target user fit matrix, 8 existing capability areas (user app, holdings, decision engine, execution/reconciliation, AI assistant, research/evidence, Alpha lifecycle, admin backend), a truth-vs-experiment assessment table, P0/P1/P2 feature gap priorities, a three-phase roadmap (credibility → governance → controlled expansion), and explicit feedback questions for reviewers.
  - Includes quantified codebase anchors: 15 API route groups, 6 admin pages, 17 Tab pages, 102 test files.
- **Feat: build art-directed mobile-first landing page as an independent deploy unit.**
  - New `landing/` sub-project: Vite + React scaffold with independent `package.json`, `vercel.json`, and `vite.config.js` for standalone Vercel deployment.
  - Full art-directed page (711 lines JSX, 3,125 lines hand-crafted CSS) with 8 sections: glassmorphism header, Warhol-tone hero with halftone visual patterns, interactive action card stack (5 cards with CSS-variable-driven fan layout and `is-selected` state), Marvix architecture flow diagram, Ask Nova showcase, 4-tier pricing board (Free/Lite/Pro/Ultra), FAQ accordion, first-reactions testimonials, distribution credits, and full legal footer with regulatory disclaimers.
  - 6 brand assets added: `nova-logo.png`, `ask-nova-shot.jpg`, 4 product screen captures (`today-screen.png`, `nova-screen.png`, `browse-screen.png`, `menu-screen.png`).
  - All content is data-driven (pricing plans, FAQs, action cards, testimonials defined as JS arrays), semantic HTML (`<article>`, `<section>`, `<nav>`, `<blockquote>`, `<cite>`, `<details>`), and accessible (`aria-label`, `aria-pressed`).
  - Mobile-first responsive design with layered `@media` breakpoints (e.g. 520px, 760px, 900px, 1100px, and sub-375px refinements); see follow-up fix entry below for statement fan, pricing, distribution, and motion.
- **Fix: landing page narrow-viewport layout, distribution copy, and motion preferences (`landing/`).**
  - **Statement / action-card fan:** `ResizeObserver` drives fit-to-width scaling; transform uses scale only (no horizontal translate drift); at ≤1100px the stack viewport goes full-bleed (`100vw`) with safe-area horizontal padding so layout math matches real device width.
  - **Pricing:** small screens use a 2×2 board; card titles stay on one line where needed (`nowrap` / ellipsis); typography tuned per breakpoint.
  - **Distribution:** headline and story blocks no longer clip to an overly tight `ch`-based max width on small screens; copy/lead/context use full available width. **Credits** list spans the full grid row at ≤1100px (`grid-column: 1 / -1`, `min-width: 0`, `justify-self: stretch`); at ≤900px credits switch to a **single column** so names and roles use the full content width (avoids a “one narrow column + empty grid” look next to the page background grid).
  - **Other sections:** additional mobile passes for ribbon, proof, ask, FAQ, voices, and legal (spacing, type, touch targets where relevant).
  - **Accessibility:** `prefers-reduced-motion: reduce` trims transitions (e.g. FAQ disclosure) for users who request reduced motion.
- **Chore: restructure domain layout from 4-part to 5-part deployment.**
  - Root domain `novaquant.cloud` now serves the landing page; main app moves to `app.novaquant.cloud`.
  - CORS default whitelist in `src/server/api/app.ts` updated to include both `app.novaquant.cloud` (primary) and `novaquant.cloud` (backward-compatible).
  - Password reset email link (`src/server/auth/resetEmail.ts`) and invite link (`src/components/MenuTab.jsx`) updated to new app subdomain.
  - All landing page CTAs (sign up, Get started, Open NovaQuant, pricing cards) point to `app.novaquant.cloud`.
  - 4 test files updated with new CORS origin assertions (`apiCors.test.ts`, `apiIndexRoute.test.ts`, `passwordResetApi.test.ts`, `signupWelcomeApi.test.ts`).
  - 5 documentation files updated: `README.md`, `admin/README.md`, `architecture.md`, `docs/REPOSITORY_OVERVIEW.md`, `server/README.md`.
  - `.env.example` updated: `NOVA_APP_ALLOWED_ORIGINS` and `NOVA_APP_URL` examples reflect new subdomain.
- **Fix: refine landing page header glassmorphism.**
  - Add `background-clip: padding-box` and `clip-path: inset(0 round 999px)` to prevent gradient bleed past pill border-radius.
  - Tune `::before` pseudo-element inset, height, opacity, and radial-gradient parameters for cleaner glass reflections without corner artifacts.
- **Fix: correct "Distrbution" → "Distribution" typo in landing page navigation.**
- **Fix: sync `.env` CORS origins with domain restructure.**
  - `NOVA_APP_ALLOWED_ORIGINS` in `.env` was still `https://novaquant.cloud` only; added `https://app.novaquant.cloud` as primary origin. Resolved 3 CORS test failures (`apiCors.test.ts`, `apiIndexRoute.test.ts`).
- **Fix: harden `executionGovernance.test.ts` fetch mock for Node.js 25.**
  - Root cause: `vi.spyOn(globalThis, 'fetch')` cannot intercept Node.js 25's built-in `fetch` (non-configurable property). Replaced with direct `globalThis.fetch = vi.fn()` assignment with save/restore in `afterEach`.
  - Added `mockImplementation(defaultResponse)` fallback so extra fetch calls from `fetchWithRetry` don't crash with `undefined`.
  - Added `vi.stubEnv` for `ALPACA_API_KEY` and `ALPACA_API_SECRET` in `beforeEach` for proper env isolation.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 10.4.3 (2026-03-24)

- Release type: patch
- **Feat: Today tab viewport-fit layout — single-screen, no-scroll homepage.**
  - All Today tab content (header, climate strip, action card carousel, summary grid) now fits within a single viewport on all iPhone sizes (SE 375×667 through 14 Pro Max 430×932) without vertical scrolling.
  - CSS-only implementation using `dvh` units and `clamp()` for proportional scaling of padding, gaps, font sizes, and component heights based on viewport height.
  - Action card dynamically fills available space between climate strip and summary grid via `flex: 1` + `justify-content: space-between`.
  - Summary cards (Why now / Keep in mind) pinned just above the tab bar.
  - Stats grid forced to 3-column layout, action buttons remain side-by-side on all screen sizes.
  - Fix `line-clamp` vendor prefix lint warnings by adding standard `line-clamp` property.
  - Transparent main content background to eliminate visible container rectangle behind cards.

## 10.4.2 (2026-03-24)

- Release type: patch
- **Fix: resolve flaky `controlPlaneStatus.test.ts` race condition.**
  - Root cause: `baseTs` random offset of only 10,000 ms allowed parallel test workers' `workflow_runs` to collide in `ORDER BY updated_at_ms DESC LIMIT 6` queries.
  - Fix: move base epoch from year 2099 to year 2199 and widen random range from 10K to 1B ms. Verified with 5/5 consecutive runs.
- **Refactor: decompose `src/App.jsx` (2,150 → 955 lines, -56%).**
  - New `src/hooks/useAuth.js` (397 lines): full auth lifecycle — login, signup, password reset, session hydration, profile sync, logout.
  - New `src/hooks/useAppData.js` (218 lines): 11-endpoint parallel data loading, 2-minute auto-refresh, `FORCE_DEMO_BUILD` local pipeline fallback.
  - New `src/hooks/useEngagement.js` (371 lines): engagement state, discipline tracking, morning check, boundary, wrap-up, weekly review, execution recording, VIP redemption.
  - New `src/hooks/useInvestorDemo.js` (189 lines): investor demo mode, holdings source composition, connected holdings derivation.
  - New `src/hooks/useNavigation.js` (106 lines): tab/stack navigation, My-tab routing, AI seed requests, cross-tab navigation.
  - New `src/config/appConstants.js` (163 lines): `MENU_PARENTS`, `DEMO_MANUAL_STATE`, `MY_SECTION_LIST`, `initialData`, `buildTabMeta`, `buildMenuTitles`.
  - New `src/components/icons/TabBarIcon.jsx` (69 lines): tab bar SVG icon component.
  - New `src/components/icons/TopBarMenuGlyph.jsx` (27 lines): menu hamburger SVG component.
  - `App.jsx` is now a thin orchestrator: hook composition + render tree + top bar + tab bar + modals.
- **Refactor: modularize `src/styles.css` (16,813 → 12 domain modules).**
  - New `src/styles/` directory with 12 chronologically-ordered CSS modules: `base.css` (2,767), `mobile-ux.css` (878), `interaction-system.css` (1,078), `consumer-layer.css` (1,105), `ai-chat.css` (182), `today-redesign.css` (1,217), `ai-rebuild.css` (389), `robinhood-surfaces.css` (953), `today-final.css` (979), `holdings.css` (3,248), `polish.css` (1,687), `corrections.css` (2,330).
  - `src/styles.css` reduced to 22 lines of ordered `@import` statements.
  - CSS output unchanged at 242.98 kB (zero visual regression).
- Zero logic changes across all three refactors. `npm run verify` passes: lint ✓, typecheck ✓, 102/102 test files ✓, 591/591 tests ✓, build ✓.
- Update version metadata to 10.4.2 (build 63).

## 10.4.1 (2026-03-24)

- Release type: patch
- **Refactor: extract inline pages and utilities from `src/App.jsx` (3,088 -> 2,149 lines, -30%).**
  - New `src/utils/date.js`: 7 date utility functions (`pad`, `localDateKey`, `keyToDate`, `shiftDateKey`, `weekStartKey`, `addUniqueKey`, `calcStreak`).
  - New `src/utils/appHelpers.js`: 7 app-level utilities (`normalizeEmail`, `isLocalAuthRuntime`, `classifyAuthError`, `detectDisplayMode`, `settledValue`, `mapExecutionToTrade`, `runWhenIdle`).
  - New `src/components/DataStatusTab.jsx`: data freshness/coverage status page (was inline `renderDataStatus()`).
  - New `src/components/LearningLoopTab.jsx`: learning loop / flywheel status page (was inline `renderLearningStatus()`).
  - New `src/components/SettingsTab.jsx`: settings page (was inline `renderSettings()`).
  - New `src/components/DisciplineTab.jsx`: discipline tracking page (was inline in `renderMenuSection()`).
  - Deduplicate `baseContext` construction: unified into a single `useMemo`, used by both `askAi()` and `<AiPage>`.
  - All 4 new components are code-split via `React.lazy()`. UX note: first visit to Data Status, Learning Loop, Settings, and Discipline pages now shows a brief Skeleton loading state (previously rendered inline/synchronously). No business logic changes. 102/102 test files, 591/591 tests pass. Build OK.
- Update version metadata to 10.4.1 (build 62) in `package.json`, `src/config/version.js`, and `README.md`.

## 10.4.0 (2026-03-24)

- Release type: minor
- **Refactor: split `src/server/api/app.ts` (2,071 lines / 91 routes) into 15 domain-specific Express Router files + shared helpers.**
  - New `src/server/api/helpers.ts`: shared parsers (`parseMarket`, `parseTimeframe`, `parseAssetClass`, `parseSignalStatus`), `asyncRoute` wrapper, session/auth scope utilities.
  - New `src/server/api/routes/`: `auth.ts` (8), `admin.ts` (11), `browse.ts` (6), `signals.ts` (3), `market.ts` (6), `decision.ts` (2), `engagement.ts` (9), `execution.ts` (7), `research.ts` (22), `evidence.ts` (7), `nova.ts` (7), `chat.ts` (4), `connect.ts` (6), `manual.ts` (4), `runtime.ts` (5).
  - `app.ts` reduced to ~210 lines: middleware (JSON, CORS, session scope), 2 special routes (`/healthz`, `/api/internal/marvix/ops`), 15 router mounts, error handler.
  - Zero logic changes. All 102 test files and 591 tests pass. Lint, typecheck, format, build all green.

## 10.3.5 (2026-03-24)

- Release type: patch
- Add GitHub Actions CI workflow (`.github/workflows/ci.yml`). Runs on push to `main` and all PRs: lint (repo policy) -> format check -> typecheck -> test -> build. Uses Node.js 22 with npm cache. Tests run with `--retry 2` to handle parallel-worker data races in SQLite.
- Improve flaky test diagnostics: `executionGovernance.test.ts` now logs the full `submitExecution` response on failure; `controlPlaneStatus.test.ts` now logs available workflow IDs when `.find()` misses.

## 10.3.4 (2026-03-24)

- Release type: patch
- Apply Prettier formatting across the entire codebase (490 files). Enforces consistent 2-space indent, single quotes, trailing commas per `.prettierrc`. No logic changes; all 102 test files and 591 tests pass. Future edits are auto-formatted by the PostToolUse hook.

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

# Maintainability Backlog

This backlog tracks the highest-leverage maintainability work so refactors can be chosen from current repo shape instead of memory.

## 1. Giant Files By Size

These files are currently the largest implementation surfaces in `src/` and should be treated as refactor candidates before they absorb more responsibilities.

| File                                         | Approx. lines | Why it matters                                                                 | Recommended next cut                                                               |
| -------------------------------------------- | ------------: | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `src/styles/onboarding.css`                  |          5469 | Very large page stylesheet with high visual coupling and difficult safe edits. | Continue splitting now that `onboarding-shell.css` owns shell/poster framing.      |
| `src/styles/today-final.css`                 |          4649 | Today still concentrates most high-density UI styling in one file.             | Continue separating climate/detail and preview treatments now that deck is split.  |
| `src/server/api/queries.ts`                  |          3909 | Still the central query composition monolith even after slice extraction.      | Keep trimming remaining domain helpers until it is mostly wiring and cache policy. |
| `src/server/db/repository.ts`                |          3830 | Broad persistence surface with many unrelated concerns in one module.          | Split by domain table groups or read/write families.                               |
| `src/server/nova/productionStrategyPack.ts`  |          3552 | Large strategy-pack generator with high cognitive load.                        | Break into pack assembly, validation, and export helpers.                          |
| `src/server/db/postgresRuntimeRepository.ts` |          3361 | Runtime DB access remains dense and hard to isolate in review.                 | Separate runtime reads from write and mirror helpers.                              |
| `src/server/admin/postgresBusinessRead.ts`   |          3181 | Admin read layer continues to accrete dashboard-specific branches.             | Slice by dashboard domain or report type.                                          |
| `src/components/TodayTab.jsx`                |          2586 | Today rendering is better than before but still a large ownership surface.     | Keep peeling out section-level components and view-model helpers.                  |
| `src/server/public/browseService.ts`         |          2533 | Browse logic remains broad and easy to regress indirectly.                     | Split home feed, detail assembly, and search/read helpers.                         |
| `src/components/MenuTab.jsx`                 |          2263 | My/Menu UI still mixes large content sections with layout behavior.            | Extract section components and policy text blocks.                                 |

## 2. Highest-Churn Files

Recent change frequency suggests these files deserve stronger boundaries and cheap tests.

| File                          | Recent churn signal             | Suggested guardrail                                                          |
| ----------------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| `CHANGELOG.md`                | touched almost every phase      | keep phase headings synchronized through version tooling only                |
| `README.md`                   | frequent architecture edits     | add static tests for critical architecture links                             |
| `src/App.jsx`                 | repeated shell refactors        | keep orchestration-only policy and continue moving decisions into `src/app/` |
| `src/styles.css`              | common sink for visual changes  | preserve first-paint-only rule with shell/style boundary tests               |
| `src/server/api/queries.ts`   | repeated runtime and slice work | continue reducing read ownership per phase                                   |
| `src/server/api/app.ts`       | route growth                    | add route-focused tests when new API families land                           |
| `src/components/TodayTab.jsx` | recurring product work          | prefer section extraction over inline branching                              |

## 3. Weak Or Costly Boundaries

These areas are still maintainable only because contributors remember the rules. They benefit most from explicit boundaries.

- App shell orchestration versus screen-specific rendering
  - Current guardrails exist, but new shell behavior should continue to land in `src/app/*` helpers first.
- Runtime snapshot ownership versus deferred follow-up fetches
  - `useAppData` is much better now, but every new first-screen field should be evaluated for `runtime-state` inclusion before adding more client fan-out.
- Query composition root versus domain-specific read logic
  - `queries.ts` still carries too much read and mutation context in one place.
- Cross-origin path allowlists versus Vercel inline public routes
  - `src/server/api/httpAllowlists.ts` now centralizes `CROSS_ORIGIN_READ_PATHS`, `USER_SCOPED_CACHE_PATHS`, and `VERCEL_PUBLIC_BROWSER_PATH_SET` (runtime-state excluded from Vercel inline). New public GET surfaces that need browser CORS still require updating this module and verifying both entrypoints.
- Research HTTP surface versus Qlib factory body parsing
  - `src/server/api/routes/research.ts` is a thin `Router.use` facade. Add factor- and qlib-related endpoints in `routes/research/researchFactorsRoute.ts`; add doctrine / diagnostics / registry / explain handlers in `routes/research/researchReportsRoute.ts`; share Qlib POST parsers via `routes/research/researchParsers.ts`.
- CSS layer boundaries between shell frame, page surface, and feature detail
  - token splits have started, Today shell framing and deck now have their own stylesheets, but the biggest stylesheets still need section-level ownership.
  - onboarding shell framing now lives in `src/styles/onboarding-shell.css`.

## 4. Testing Gaps To Close

- Keep `tests/httpAllowlists.test.ts` aligned when adding or removing Vercel inline public paths or cross-origin read paths.
- Keep static query-slice boundary tests current as new domains are extracted.
- Add section-level tests around `TodayTab.jsx` once more rendering logic moves into subcomponents.
  - `TodayDeckSection.jsx` is now extracted; expand coverage as more sections split.
  - `TodayClimateHeader.jsx` is now extracted; add more section guards as needed.
- Add CSS ownership tests for onboarding and deeper Today sub-surfaces as their stylesheets continue splitting.
  - onboarding shell import is now guarded by `tests/onboardingCssSplit.test.ts`.
- Add admin-domain boundary tests if `postgresBusinessRead.ts` is divided by dashboard family.

## 5. Recommended Next Sequence

1. Continue splitting `src/styles/today-final.css` now that `src/styles/today-shell.css` and `src/styles/today-deck.css` own shell and deck framing.
2. Split `src/styles/onboarding.css` by flow step or page section (shell now lives in `src/styles/onboarding-shell.css`).
3. Continue shrinking `src/components/TodayTab.jsx` with section components and feature-local state helpers (deck section now lives in `src/components/today/TodayDeckSection.jsx`, climate header in `src/components/today/TodayClimateHeader.jsx`).
4. Identify the next non-trivial query domain worth slicing out of `queries.ts`.
5. Keep boundary tests current whenever a new slice or stylesheet layer is added.

## 6. Update Rule

Update this backlog whenever one of the following happens:

- a file enters or leaves the top giant-file list
- a new architecture boundary is formalized
- a high-churn file gets a new guardrail
- a recommended next cut is completed

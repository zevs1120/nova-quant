# Maintainability Backlog

This backlog tracks the highest-leverage maintainability work so refactors can be chosen from current repo shape instead of memory.

## 1. Giant Files By Size

These files are currently the largest implementation surfaces in `src/` and should be treated as refactor candidates before they absorb more responsibilities.

| File                                         | Approx. lines | Why it matters                                                                 | Recommended next cut                                                                       |
| -------------------------------------------- | ------------: | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `src/styles/onboarding.css`                  |          5723 | Very large page stylesheet with high visual coupling and difficult safe edits. | Split shell tokens, onboarding flow sections, and one-off utility clusters.                |
| `src/styles/today-final.css`                 |          5635 | Today still concentrates most high-density UI styling in one file.             | Separate shell framing, deck layout, and Today detail treatments.                          |
| `src/server/api/queries.ts`                  |          3909 | Still the central query composition monolith even after slice extraction.      | Extract `engagementReads` and `portfolioReads`, leave only wiring and shared cache policy. |
| `src/server/db/repository.ts`                |          3830 | Broad persistence surface with many unrelated concerns in one module.          | Split by domain table groups or read/write families.                                       |
| `src/server/nova/productionStrategyPack.ts`  |          3552 | Large strategy-pack generator with high cognitive load.                        | Break into pack assembly, validation, and export helpers.                                  |
| `src/server/db/postgresRuntimeRepository.ts` |          3361 | Runtime DB access remains dense and hard to isolate in review.                 | Separate runtime reads from write and mirror helpers.                                      |
| `src/server/admin/postgresBusinessRead.ts`   |          3181 | Admin read layer continues to accrete dashboard-specific branches.             | Slice by dashboard domain or report type.                                                  |
| `src/components/TodayTab.jsx`                |          2772 | Today rendering is better than before but still a large ownership surface.     | Keep peeling out section-level components and view-model helpers.                          |
| `src/server/public/browseService.ts`         |          2533 | Browse logic remains broad and easy to regress indirectly.                     | Split home feed, detail assembly, and search/read helpers.                                 |
| `src/components/MenuTab.jsx`                 |          2263 | My/Menu UI still mixes large content sections with layout behavior.            | Extract section components and policy text blocks.                                         |

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
- CSS layer boundaries between shell frame, page surface, and feature detail
  - token splits have started, but the biggest stylesheets still need section-level ownership.

## 4. Testing Gaps To Close

- Add slice tests when `engagementReads` or `portfolioReads` are extracted from `queries.ts`.
- Add section-level tests around `TodayTab.jsx` once more rendering logic moves into subcomponents.
- Add CSS ownership tests for onboarding and Today sub-surfaces if their stylesheets start splitting.
- Add admin-domain boundary tests if `postgresBusinessRead.ts` is divided by dashboard family.

## 5. Recommended Next Sequence

1. Extract `engagementReads` from `src/server/api/queries.ts`.
2. Extract `portfolioReads` from `src/server/api/queries.ts`.
3. Split `src/styles/today-final.css` into shell, deck, and detail layers.
4. Split `src/styles/onboarding.css` by flow step or page section.
5. Continue shrinking `src/components/TodayTab.jsx` with section components and feature-local state helpers.

## 6. Update Rule

Update this backlog whenever one of the following happens:

- a file enters or leaves the top giant-file list
- a new architecture boundary is formalized
- a high-churn file gets a new guardrail
- a recommended next cut is completed

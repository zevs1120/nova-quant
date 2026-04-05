# Frontend And Runtime Code Map

This map is the shortest path to the files that control shell composition, Today data loading, and runtime read boundaries.

## 1. App Shell Entry Points

Primary shell orchestration lives in `src/App.jsx`.

- `src/App.jsx`
  Thin composition root. It wires auth, navigation, app data, engagement, demo state, and the current screen renderer together.
- `src/app/topBarState.js`
  Shared top bar and primary tab derived state. Put shell-wide label, badge, and title decisions here instead of inlining them inside components.
- `src/app/shellLayout.js`
  Secondary canvas and shell frame derivation. Use this for shell-level layout decisions that apply across Browse, Nova, My, and Menu surfaces.
- `src/app/screenRegistry.jsx`
  Active-screen dispatch. Keep tab-to-screen branching here so `App.jsx` stays an orchestrator instead of becoming a render switchboard again.

## 2. Today UI And Feature-Local Derived State

Today-specific derived view state belongs next to the Today feature, not in the app shell.

- `src/components/TodayTab.jsx`
  Owns Today rendering, section composition, and feature-level interaction wiring.
- `src/components/today/todayDeckState.js`
  Shared derived state for Today cards, deck previews, and section-facing view models.
- `src/hooks/useEngagement.js`
  Frontend hook that owns ritual and engagement fetch / mutation flow used by Today and My.

Rule of thumb:

- If logic is reused across shell surfaces, place it in `src/app/`.
- If logic only exists to support Today rendering, place it under `src/components/today/`.

## 3. Runtime Snapshot And Frontend Hydration Boundary

The primary frontend read path starts from `useAppData`.

1. `src/hooks/useAppData.js`
   Requests `/api/runtime-state` first and treats that payload as the primary snapshot.
2. `src/server/api/routes/runtime.ts`
   Registers the route contract for `/api/runtime-state`.
3. `src/server/api/queries.ts`
   Hosts shared query infrastructure, frontend-read caching, inflight coalescing, and composes read slices.
4. `src/server/api/queries/runtimeReads.ts`
   Owns runtime snapshot shaping, hydration metadata, and public fallback application.
5. `src/server/api/queries/todayReads.ts`
   Owns Today decision and engagement reads that were extracted from the monolith.

Hydration boundary today:

- `runtime-state` is the high-frequency snapshot entry point.
- `useAppData` may still perform deferred fill for data that is intentionally not always included in the first payload.
- When changing first-screen fields, prefer expanding `runtime-state` deliberately before adding another follow-up fetch.

## 4. Query Slice Map

The query layer is moving from one large file to domain slices.

Already extracted:

- `src/server/api/queries/runtimeReads.ts`
- `src/server/api/queries/browseReads.ts`
- `src/server/api/queries/todayReads.ts`

Still centered in `src/server/api/queries.ts`:

- shared cache and invalidation helpers
- write paths and mutation handlers
- remaining domain reads that have not been split yet

Suggested next slices:

- `engagementReads`
- `portfolioReads`
- any remaining high-churn runtime-adjacent read helpers

## 5. How To Use This Map During Refactors

When touching shell behavior:

- start at `src/App.jsx`
- move shared derived decisions into `src/app/*`
- keep CSS ownership out of registry helpers

When touching Today loading:

- start at `src/hooks/useAppData.js`
- verify whether the change belongs in `runtime-state`
- then follow into `runtimeReads.ts` or `todayReads.ts`

When touching query maintainability:

- treat `src/server/api/queries.ts` as the composition root
- prefer extracting new domain helpers into `src/server/api/queries/`
- leave the root file with wiring, cache policy, and cross-slice composition

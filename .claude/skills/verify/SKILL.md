---
name: verify
description: Run the full verification gate (lint + typecheck + test + build). Use before marking work done or before commits.
---

Run the project's full verification pipeline:

```bash
npm run verify
```

This executes sequentially: `lint` -> `typecheck` -> `test` -> `build` -> `build:landing` (Vite app in `landing/`).

If any step fails:

1. Read the error output carefully
2. Fix the issue in the source code
3. Re-run `npm run verify` to confirm the fix
4. Do not skip failing steps or mark work as complete until all steps pass

For faster iteration on a specific failure, run the individual command:

- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Tests: `npm test` (or `npx vitest run tests/<file>.test.ts` for a single test)
- Build: `npm run build`
- Landing: `npm run build:landing`

# Pro-Env E2E Report

Date: `2026-04-06`

Suite:

- Command: `PLAYWRIGHT_E2E_MODE=pro-env npx playwright test tests/pro-env/ --project=chromium --workers=1`
- Env source: local `.env` mapped into required Playwright variables
- Secrets: redacted

## Result

- Total: `4`
- Passed: `3`
- Failed: `1`

## Passed

1. `auth-smoke.spec.js` -> App auth smoke
2. `auth-smoke.spec.js` -> Landing reachability
3. `data-integrity.spec.js` -> Admin/App/API runtime consistency

## Failed

1. `quant-research-loop.spec.js` -> direct Qlib Bridge reachability

Failure:

```text
apiRequestContext.get: connect ECONNREFUSED 127.0.0.1:8788
GET http://127.0.0.1:8788/api/status
```

## What Was Fixed In The Test Code

- `loginApp()` now handles the real production flow correctly:
  - intro page
  - login form
  - first-run setup
  - app shell
- `runtime-state` assertions now match the live production contract:
  - payload is an envelope
  - actual runtime fields are under `data`
  - transparency is under `data_transparency`
- Vitest no longer accidentally executes `tests/pro-env/**`

## What The Remaining Failure Means

The last failing case is not blocked by Playwright selectors anymore.

It is blocked by the configured bridge endpoint:

- `QLIB_BRIDGE_URL=http://127.0.0.1:8788`

At run time, that endpoint was not accepting connections from this machine. This usually means one of:

1. The local SSH tunnel to EC2 is not up
2. The bridge process is not listening on `8788`
3. The intended bridge URL for this run is not actually `127.0.0.1`

## Recommended Next Step

Re-run the same suite after making `QLIB_BRIDGE_URL` reachable from this machine.

Expected outcome after env fix:

- if `GET $QLIB_BRIDGE_URL/api/status` returns `200`, the remaining scenario should move past the bridge reachability check
- any further failure after that will be a genuine strategy/backtest chain issue rather than login or payload-shape drift

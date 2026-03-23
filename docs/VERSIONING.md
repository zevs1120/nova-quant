# NovaQuant Versioning

Last updated: 2026-03-23

Nova Quant (product; also styled **NovaQuant** in code and URLs) uses semantic versioning for product releases and a monotonically increasing build number for internal runtime tracking.

## Canonical Source

- `package.json` is the canonical semantic version source.
- `src/config/version.js` is a generated mirror consumed by frontend and backend runtime code.
- `CHANGELOG.md` is the release history.
- `README.md` mirrors the current release line for fast operator visibility.

## SemVer Rules

- `MAJOR`: new stage, breaking architecture, category-shift product change, incompatible schema or API shift.
- `MINOR`: net-new user-facing capability or standalone backend module without breaking previous contracts.
- `PATCH`: bug fix, UI polish, stability, internal refactor, version/process/documentation maintenance.

## Build Number

- Every version bump increments `APP_BUILD_NUMBER`.
- Build number is monotonic and independent from semantic version segments.

## Commands

```bash
npm run version:current
npm run version:major -- --summary "..."
npm run version:minor -- --summary "..."
npm run version:patch -- --summary "..."
```

`--summary` can be repeated to add multiple changelog bullets for the release.

## Sync Targets

The version manager updates:

- `package.json`
- `package-lock.json`
- `src/config/version.js`
- `README.md`
- `CHANGELOG.md`

About reads version/build metadata from runtime config, which in turn reads the generated `src/config/version.js` constants.

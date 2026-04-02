# 测试策略与性能说明

## 依赖与 DOM 环境

- 前端 Hook / JSX 组件测试使用 **`happy-dom`** + **`@testing-library/react`**（见 `package.json` devDependencies）。
- `tests/vitest.setup.ts` 在检测到 **不完整的全局 `localStorage`**（例如 Node 25+ 实验实现缺少 `.clear`）时，会用 `happy-dom` 的 `Window` 注入可用的 `localStorage`（并在缺失时补 `window` / `document`），避免 Hook 与 `browseWarmup` 等模块在 CI/本机行为不一致。

## 运行方式

- 全量：`npm test`（等同 `vitest run`）
- 门禁：`npm run verify`（lint → Prettier 检查 → typecheck → test → 根目录 build → `landing` build → `admin` build）
- 单文件：`npx vitest run tests/<name>.test.ts`

## 为什么曾经很慢

1. **强制串行**：`vite.config.js` 曾设置 `fileParallelism: false` 与 `maxWorkers: 1`，使上百个测试文件顺序执行，墙钟时间可达 **50s+**。
2. **重复日志**：多个测试文件会间接加载 `src/server/config.ts` 并触发 `dotenv.config()`；在 Vitest 下通过 `test.env.DOTENV_CONFIG_QUIET` 抑制提示，减少噪音与少量 I/O。
3. **合理并行**：恢复 Vitest 默认的**文件级与工作池并行**后，全量通常在 **约 10s 量级**（视 CPU 而定）。若出现与全局单例相关的偶发失败，再针对个别文件使用 `describe.sequential` 或隔离用例，而不是默认全仓串行。

## 覆盖重点（与产品风险对齐）

- **后端**：API、鉴权、Postgres 内存桩、决策/证据/参与引擎等以 `tests/*.test.ts` 为主；新增逻辑应带回归与边界用例。
- **前端**：主壳组件为 JSX 且未进 `tsc`。除 `src/utils/*` 工具链外，补充了 **`src/hooks/*.js` 的 `renderHook` 用例**、`browseWarmup` / `signalDetails` 缓存语义、**`admin/src/components` 的轻量组件测试**（`tests/admin/*.jsx`）。Vite 在 Vitest 下启用 **React 插件** 以编译 JSX 测试与 admin 引用。

## Pre-commit

`.husky/pre-commit`：`check-changelog` → `npm run verify` → `lint-staged`（Prettier）。提交前需同步更新并暂存 `CHANGELOG.md`（见 `scripts/check-changelog.mjs`）。

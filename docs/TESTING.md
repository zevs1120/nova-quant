# 测试策略与性能说明

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
- **前端**：主壳组件为 JSX 且未进 `tsc`，高价值覆盖放在 **纯 JS 工具链**（如 `fetchApi`、`apiBase`、`appHelpers`、`format`），在 Node 环境用 mock `fetch` / `window` 即可稳定复现本地 API 发现与错误文案等行为。

## Pre-commit

`.husky/pre-commit`：`check-changelog` → `npm run verify` → `lint-staged`（Prettier）。提交前需同步更新并暂存 `CHANGELOG.md`（见 `scripts/check-changelog.mjs`）。

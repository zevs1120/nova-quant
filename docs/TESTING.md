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
- **浏览器 API 治理**：`fetchApi` 经 `src/shared/http/apiGovernance.js` 做请求合并、路径级最小间隔与失败退避；其中并发合并只覆盖 **GET / HEAD** 与显式幂等的 `POST /api/engagement/state`，避免写请求被错误折叠。治理状态同时写入共享存储，覆盖同源多标签页的 pause/backoff/spacing 协调。回归见 `tests/apiGovernance.test.ts`（`NODE_ENV=test` 时不启用最小间隔，避免拖慢单测）。
- **性能 / 缓存回归**：`tests/performanceOptimization.test.ts` 会走真实 `createApiApp()` 的 browse 读路径；其 Cache-Control 子套件会 `stubEnv('GEMINI_API_KEY', '')`，避免本机 `.env` 含 Gemini 密钥时新闻刷新链路调用 LLM 客户端而拖慢或挂起单测。

### 主壳 / Today / Nova 相关（关键链路，非 UI 快照）

以下用例针对 **lazy 分包、会员裁剪、信号详情文案、首启路由** 等高风险路径；**不**替代 E2E / 真机手势测试。

| 区域             | 测试文件                                                                                                                                                      | 说明                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 首启路由         | `tests/firstRunRouting.test.ts`                                                                                                                               | `mapEntryIntent` / `resolveFirstRunTarget`（`src/utils/firstRunRouting.js`）                                     |
| App lazy 清单    | `tests/appShellLazyImports.test.ts`、`tests/appShellLazyCatalog.test.ts`                                                                                      | 断言 `App.jsx` 对主 Tab 与常用弹层保持 `React.lazy`                                                              |
| 全局 CSS 入口    | `tests/stylesCssEntryPolicy.test.ts`                                                                                                                          | `src/styles.css` 不拉回 `today-final` / `ai-rebuild` 等重页面样式                                                |
| 会员裁剪         | `tests/membershipDecisionAccess.test.ts`                                                                                                                      | `applyMembershipAccessToDecision` / `applyMembershipAccessToRuntimeState`                                        |
| 会员策略常量     | `tests/membershipUtilsPolicy.test.ts`                                                                                                                         | `normalizeMembershipPlan`、`getTodayCardLimit`、`isPortfolioAwareRequest`、`getRemainingAskNova`                 |
| 信号详情可读字段 | `tests/signalHumanLabels.test.ts`、`tests/signalEntryBounds.test.ts`                                                                                          | `src/utils/signalHumanLabels.js`、`signalEntryBounds.js`（由 `SignalDetail.jsx` 引用）                           |
| Menu 分区路由    | `tests/menuTabSectionCatalog.test.ts`、`tests/menuSupportPredictionShortcut.test.ts`                                                                          | Support / Prediction Games 等 section 不丢                                                                       |
| 首启样式入口     | `tests/firstRunSetupCssMarker.test.ts`                                                                                                                        | `FirstRunSetupFlow` 顶层 `onboarding.css`                                                                        |
| Onboarding 重试  | `tests/appHelpers.test.ts`（节选）                                                                                                                            | `buildOnboardingRetrySessionKey`、`shouldAttemptPendingOnboardingBonusRetry`、`detectDisplayMode`、`runWhenIdle` |
| fetchApi 治理    | `tests/apiGovernance.test.ts`                                                                                                                                 | 合并范围收口到安全读请求、同源多标签共享 pause/backoff、`402`/Vercel 部署禁用全局冷却、`5xx` 退避                |
| Hook 行为回归    | `tests/hooks/useEngagement.hook.test.ts`、`tests/hooks/useAuth.hook.test.ts`                                                                                  | `engagement` 跨小时自动刷新但同小时不抖动；Supabase `TOKEN_REFRESHED/USER_UPDATED` 只触发一次 session hydrate    |
| JSX 结构锚点     | `tests/todayTabShellMarkers.test.ts`、`tests/todayClimateHeaderMarkers.test.ts`、`tests/aiPageShellMarkers.test.ts`、`tests/signalDetailShellMarkers.test.ts` | 轻量字符串契约，防大改版静默破坏（含 Today 顶部 Climate 头部 class 锚点）                                        |

## Pre-commit

`.husky/pre-commit` 现在统一通过 `scripts/run-precommit.mjs` 执行：`check-changelog` → `npm run verify` → `lint-staged`（Prettier）。提交前需同步更新并暂存 `CHANGELOG.md`（见 `scripts/check-changelog.mjs`）。

`.husky/commit-msg` 会调用 `scripts/check-commit-msg.mjs`，强制 Conventional Commits 标题格式与长度约束。

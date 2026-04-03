# Repository Guidelines

## 项目结构与模块组织

根目录是主开发入口。`src/` 放核心实现：`src/server/` 为 API、鉴权、决策、风险与研究后端；其中 **`src/server/manual/`** 承载积分、邀请分阶段、VIP 天兑换与预测市场（`manual_*` 表），说明见 **`docs/MANUAL_POINTS_AND_PREDICTION.md`**；`src/components/` 与 `src/App.jsx` 为主前端壳层（主导航 **Today / Nova / Browse / My**，多数 Tab 与常用弹层使用 `React.lazy`；`src/styles.css` 仅首屏全局样式，重页面样式在各自组件内引入）；`src/engines/` 为 JS 量化引擎管线；`src/research/` 为研究治理与验证；`src/quant/` 为偏前端的量化辅助与检索（与后端 `src/server/quant/` 运行时推导区分）；`src/training/` 含多资产训练服务入口等。`tests/` 放 Vitest 用例（体量已上百个，按特性拆分文件名）。**部署边界按五段拆分**：`landing/` 品牌落地页与数据门户相关路由、`app/` 用户端 H5、`admin/` 内部控制台、**`qlib-bridge/`**（EC2 上 Python 侧车，因子与模型推理）、仓库根目录（主 Vite 壳 + 通过 `api/index.ts` 部署到 Vercel Serverless 的主 API）。数据与快照位于 `data/`，**仓库根目录 `architecture.md` 为当前架构总览**；`docs/` 为专题设计与运维文档索引。业务与鉴权数据统一走 Supabase/Postgres：`NOVA_DATA_DATABASE_URL` 负责业务运行时，`NOVA_AUTH_DATABASE_URL` 负责 Auth/Profile；会话接口可返回 `roles` / `isAdmin`（含 `NOVA_ADMIN_EMAILS` 等解析）。EC2 部署配置位于 `deployment/aws-ec2/`，平台就绪预检脚本为 `scripts/check-platform-readiness.mjs`。

## 构建、测试与开发命令

首次进入仓库使用 `npm ci`。日常开发优先使用根脚本：

- `npm run dev`：启动本地开发栈。
- `npm run dev:web`：仅启动根 Vite Web 前端。
- `npm run start:api`：启动本地 API 服务。
- `npm test`：运行全部 Vitest 测试。
- `npm run typecheck`：执行严格 TypeScript 检查。
- `npm run build`：构建前端产物。
- `npm run verify`：串行执行 `lint`、`typecheck`、`test`、根目录 `build`、`build:landing`（`landing/` 独立站点），提交前保持通过。

## 编码风格与命名约定

仓库使用 ES Modules、严格 TypeScript 和 React。现有代码以 2 空格缩进、单引号为主；改动时优先遵循邻近文件。组件与类型用 `PascalCase`，函数、变量与服务实例用 `camelCase`，脚本文件采用 kebab-case，测试文件命名为 `<feature>.test.ts`。仓库使用 Prettier 格式化（配置见 `.prettierrc`），没有独立 ESLint 配置。`npm run lint` 实际执行 `scripts/check-repo-policy.mjs`。

## 测试指南

测试框架为 Vitest，覆盖 API、决策引擎、研究流程、数据接入与可靠性边界。新增功能应补对应 `tests/*.test.ts`，至少覆盖正常路径、边界条件与回归场景。涉及 API 或状态机时，可参考 `tests/apiServer.test.ts`、`tests/runtimeDerivation.test.ts`。修改数据管道或风险逻辑后，先跑相关测试，再跑 `npm test`。

全量测试默认 **并行**（勿无故改回单线程串行，以免 `npm test` 从约 10s 级恶化到 50s+）。前端主壳为 JSX 时，优先为 **`src/utils` 关键路径**（如 `fetchApi` 本地 base 轮换、`appHelpers` 错误文案、`format`）补充 Node 侧单测；**Hooks** 使用 `happy-dom` + `@testing-library/react` 的 `renderHook`（见 `tests/hooks/`），**admin 组件**见 `tests/admin/`。策略与说明见 `docs/TESTING.md`。

## 提交与 Pull Request 规范

最近提交采用简洁的 Conventional Commits 风格，如 `feat(market): ...`、`fix(signal,hub,db,ai): ...`、`test: ...`、`docs: ...`。请沿用该格式，并在标题中直接说明影响模块。PR 应包含变更摘要、风险点、验证命令与结果；涉及 UI 或报表时附截图。不要提交 `.env`、数据库文件、`coverage/`、`dist/` 等忽略产物，环境变量改动请同步更新 `.env.example`。

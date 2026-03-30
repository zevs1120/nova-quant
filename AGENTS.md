# Repository Guidelines

## 项目结构与模块组织

根目录是主开发入口。`src/` 放核心实现：`src/server/` 为 API、鉴权、决策、风险与研究后端，`src/components/` 与 `src/App.jsx` 为主前端壳层，`src/research/`、`src/quant/`、`src/training/` 承载量化逻辑。`tests/` 放 Vitest 用例，例如 `tests/decisionEngine.test.ts`。部署边界按四段拆分：`landing/` 品牌落地页、`app/` 用户端、`admin/` 内部控制台、仓库根目录（主 API + 量化核心，通过 `api/index.ts` 部署到 Vercel Serverless Functions）。数据与快照位于 `data/`，设计与运行说明集中在 `docs/`。业务数据默认仍以 SQLite (`data/quant.db`) 为运行时主路径，可选通过 `NOVA_DATA_DATABASE_URL` 启用 Supabase Postgres 镜像（写入自动同步 + Admin/API 优先读取）；`NOVA_DATA_RUNTIME_DRIVER=postgres` 可用于 EC2 canary，但当前 Postgres runtime 仍经由同步 bridge。EC2 部署配置位于 `deployment/aws-ec2/`，平台就绪预检脚本为 `scripts/check-platform-readiness.mjs`。

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

## 提交与 Pull Request 规范

最近提交采用简洁的 Conventional Commits 风格，如 `feat(market): ...`、`fix(signal,hub,db,ai): ...`、`test: ...`、`docs: ...`。请沿用该格式，并在标题中直接说明影响模块。PR 应包含变更摘要、风险点、验证命令与结果；涉及 UI 或报表时附截图。不要提交 `.env`、数据库文件、`coverage/`、`dist/` 等忽略产物，环境变量改动请同步更新 `.env.example`。

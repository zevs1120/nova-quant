# Nova Quant — Architecture Overview

> 自动扫描生成 · 最后更新: 2026-03-24
> Version: 10.1.2 (build 60)

---

## 1. 定位

Nova Quant 是一个 **AI-native 量化决策平台**，面向美股与加密货币的自主交易者。
核心理念是帮助用户 **减少情绪化交易、以纪律执行**，而不是一个自动交易机器人或虚假绩效展示工具。

---

## 2. Monorepo 部署拓扑

```
nova-quant/
├── app/       → 用户端 H5 前端 (Vercel)     → novaquant.cloud
├── server/    → 纯 API 层 (Vercel)           → api.novaquant.cloud
├── admin/     → 内部管理后台 (Vercel)         → admin.novaquant.cloud
└── model/     → EC2 端模型边界 & 信号合约
```

**运行时规则**:
| 层       | 允许                     | 禁止                     |
|----------|--------------------------|--------------------------|
| `app/`   | 仅调用 API               | 直接读写数据库           |
| `admin/` | 仅调用 API               | 直接读写数据库           |
| `server/`| 读写数据库、响应 API 请求 | —                        |
| `model/` | 推送标准信号到 server     | 触碰用户数据             |

---

## 3. 技术栈

| 类别              | 选型                                          |
|-------------------|-----------------------------------------------|
| 前端框架          | React 18 + Vite 5, JSX                        |
| 后端框架          | Express 5 (TypeScript)                        |
| 业务数据库        | SQLite (better-sqlite3) — `data/quant.db`     |
| 认证数据库        | Postgres (生产推荐) / Upstash Redis (遗留) / SQLite (本地) |
| 类型检查          | TypeScript 5.9                                |
| 测试框架          | Vitest 4 + Supertest                          |
| 部署平台          | Vercel (前端 + API) / AWS EC2 (模型 + 后端自动化) |
| LLM 运行时        | Ollama (本地 Marvix 模型族) + Gemini / OpenAI / Groq 回退 |
| 图表              | Chart.js + react-chartjs-2                    |

---

## 4. 目录结构总览

```
nova-quant/
│
├── src/                          # 核心源码
│   ├── App.jsx                   # 移动优先产品壳 & Tab 编排 (106 KB)
│   ├── main.jsx                  # React 入口
│   ├── styles.css                # 全局样式 (314 KB)
│   ├── i18n.js                   # 国际化 (中/英)
│   │
│   ├── components/               # 29 个 UI 组件
│   ├── hooks/                    # React Hooks (助手、本地存储、Demo)
│   ├── utils/                    # 前端工具 (API、格式化、意图解析等)
│   ├── copy/                     # 品牌文案操作系统
│   ├── config/                   # 运行时版本配置
│   ├── assets/                   # 静态资源
│   ├── demo/                     # Demo 模式相关
│   │
│   ├── engines/                  # 11 个量化引擎 (前端共享)
│   ├── quant/                    # 量化研究系统 (AI检索、研究循环)
│   ├── research/                 # 研究治理 & 验证管线
│   ├── data_sources/             # 数据源定义 (Crypto / Equities / Options)
│   ├── dataset_builders/         # 数据集构建
│   ├── feature_factories/        # 特征工厂
│   ├── normalizers/              # 数据归一化
│   ├── training/                 # 多资产训练服务
│   ├── portfolio_simulation/     # 组合模拟
│   │
│   └── server/                   # 后端核心 (38 个子模块)
│       ├── api/                  # API 路由 & 查询层 (109 条路由)
│       ├── auth/                 # 认证 (Postgres / Redis / SQLite)
│       ├── db/                   # 数据库 Schema, Repository, 连接管理
│       ├── decision/             # 决策引擎
│       ├── evidence/             # 回测 / 重放 / 证据引擎
│       ├── chat/                 # Nova Assistant (多 Provider 支持)
│       ├── research/             # 研究工具 & 知识库
│       ├── nova/                 # 本地 Marvix LLM 运行时
│       ├── risk/                 # 风险治理 & 防护
│       ├── holdings/             # 持仓导入 (CSV / 截图 / 交易所同步)
│       ├── engagement/           # 参与引擎 (晨检 / 复盘 / 周回顾)
│       ├── portfolio/            # 组合分配器
│       ├── ingestion/            # 数据摄取 (10 个连接器)
│       ├── alpha_discovery/      # 自动 Alpha 发现循环
│       ├── alpha_registry/       # Alpha 注册 & 生命周期
│       ├── alpha_evaluator/      # Alpha 评估
│       ├── alpha_mutation/       # Alpha 突变 / 优化
│       ├── alpha_shadow_runner/  # Shadow 模式运行
│       ├── alpha_promotion_guard/# 晋升守卫
│       ├── admin/                # 管理端 LiveOps & 服务
│       ├── backbone/             # 后端骨干摘要
│       ├── confidence/           # 置信度校准
│       ├── connect/              # 券商 / 交易所适配器
│       ├── delivery/             # 消息推送 (Discord / Inbox)
│       ├── domain/               # 领域合约
│       ├── evals/                # 评分卡
│       ├── feature/              # 平台特征
│       ├── jobs/                 # 后台任务 (回填、数据验证等)
│       ├── manual/               # 手动信号服务
│       ├── news/                 # 新闻提供 (Gemini Factors)
│       ├── observability/        # 可观测性脊柱
│       ├── ops/                  # Marvix 运维检视
│       ├── public/               # 公开资源路由
│       ├── quant/                # 量化运行时同步 & 缓存隔离
│       ├── registry/             # 策略注册服务
│       ├── workflows/            # 持久化工作流
│       ├── ai/                   # LLM Ops
│       └── utils/                # 服务端工具
│
├── admin/                        # 管理后台 (独立 Vite 应用)
│   └── src/
│       ├── AdminApp.jsx          # 管理应用壳
│       ├── pages/                # 6 个页面 (Overview, SystemHealth, ResearchOps, AlphaLab, Users, SignalsExecution)
│       ├── components/           # 4 个组件 (Login, Sidebar, StatCard, Topbar)
│       ├── hooks/                # Admin Hooks
│       └── services/             # Admin 服务层
│
├── server/                       # Vercel API 部署入口
│   └── api/[...route].ts        # 代理到 src/server/api/app.ts
│
├── api/                          # Vercel Serverless 函数入口
│   └── index.ts                  # 路由分发 (主 API 入口点)
│
├── model/                        # EC2 模型边界
│   ├── signal.schema.json        # 信号合约 JSON Schema
│   └── README.md
│
├── tests/                        # 104 个测试文件 (Vitest)
├── scripts/                      # 35 个运维脚本
├── config/                       # 摄取配置
├── docs/                         # 75+ 文档文件
├── deployment/                   # 部署配置 (AWS EC2 / Vultr / launchd)
├── data/                         # 运行时数据 (quant.db, 不入库)
├── public/                       # 静态公共资源
└── copilot/                      # Copilot 集成 (预留)
```

---

## 5. 核心数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│                          数据摄取层                                  │
│  Massive.com ──┐                                                    │
│  Stooq ────────┤                                                    │
│  Binance ──────┼──→ normalize ──→ SQLite (ohlcv_bars) ──→ 验证      │
│  Yahoo ────────┤                                                    │
│  Nasdaq ───────┘                                                    │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         量化引擎管线                                 │
│                                                                     │
│  raw observations                                                   │
│    → feature_factories (特征工程)                                    │
│    → signalEngine (信号生成 & 评分)                                  │
│    → funnelEngine (信号过滤漏斗)                                     │
│    → regimeEngine (市场状态识别)                                     │
│    → riskEngine + riskGuardrailEngine (风控 & 防护栏)                │
│    → performanceEngine (绩效测量)                                    │
│    → velocityEngine (动量/速度跟踪)                                  │
│    → strategyTemplates (策略模板库)                                  │
│    → pipeline (完整管线编排)                                         │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         决策 & 交付层                                │
│                                                                     │
│  Decision Engine ──→ 个性化行动卡片                                  │
│    └─ risk state + holdings context + policy filter                 │
│    └─ evidence bundle (证据包)                                      │
│    └─ confidence calibration (置信度校准)                            │
│                                                                     │
│  Engagement Engine ──→ 晨检 / 复盘 / 周回顾 / 通知 / Widget         │
│                                                                     │
│  Nova Assistant ──→ 基于证据的对话式解释                             │
│    └─ tools.ts (内部工具层: 信号、市场状态、风险、检索)              │
│    └─ prompts.ts (结构化 prompt 组装)                                │
│    └─ providers/ (Ollama → Gemini → OpenAI → Groq 回退链)           │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       前端呈现层                                     │
│                                                                     │
│  TodayTab ──────── 今日决策面板 (主着陆页)                           │
│  SignalsTab ─────── 信号列表                                         │
│  HoldingsTab ────── 持仓管理                                         │
│  RiskTab ────────── 风险仪表盘                                       │
│  ProofTab ───────── 证据 & 回测                                      │
│  MarketTab ──────── 市场概况                                         │
│  ResearchTab ────── AI 研究工具                                      │
│  AiPage ─────────── Nova 助手对话                                    │
│  BrowseTab ──────── 资产浏览 & 搜索                                  │
│  MenuTab ────────── 设置 & 高级功能                                   │
│  WeeklyReviewTab ── 周度复盘                                         │
│  OnboardingFlow ─── 首次引导流                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. 后端模块详解

### 6.1 API 层 (`src/server/api/`)

| 文件               | 职责                             | 大小     |
|--------------------|----------------------------------|----------|
| `app.ts`           | Express 应用 (109 条路由)        | 63 KB    |
| `queries.ts`       | SQLite 查询封装                  | 140 KB   |
| `authHandlers.ts`  | 认证路由处理                     | 9 KB     |
| `adminHandlers.ts` | 管理端路由处理                   | 5 KB     |
| `modelHandlers.ts` | 模型/信号摄入路由                | 10 KB    |
| `vercelChatHandler.ts` | Vercel 端对话处理            | 10 KB    |

### 6.2 数据库层 (`src/server/db/`)

| 文件             | 职责                                  | 大小     |
|------------------|---------------------------------------|----------|
| `schema.ts`      | 全部 SQLite 表定义 & 迁移             | 49 KB    |
| `repository.ts`  | 数据访问层 (CRUD 操作)               | 128 KB   |
| `database.ts`    | 连接管理 & WAL 模式配置               | 2 KB     |

**主要 SQLite 表**: `ohlcv_bars`, `runtime_state`, `decision_snapshots`, `chat_threads`, `chat_messages`, `evidence_runs`, `alpha_candidates`, `alpha_evaluations`, `alpha_shadow_observations`, `alpha_lifecycle_events`, `manual_signals`, `engagement_state` 等

### 6.3 认证层 (`src/server/auth/`)

| 文件              | 职责                                              |
|-------------------|-------------------------------------------------|
| `service.ts`      | 认证服务 (Session / RBAC / 中间件) — 49 KB        |
| `postgresStore.ts`| Postgres 认证存储 (users/sessions/roles) — 21 KB  |
| `remoteKv.ts`     | Upstash Redis 遗留认证路径                         |
| `resetEmail.ts`   | 密码重置邮件流                                     |

### 6.4 决策引擎 (`src/server/decision/`)

单文件 `engine.ts` (50 KB)，实现了从原始信号到个性化行动卡片的完整决策链：信号 → 资格过滤 → 风险状态 → 组合意图 → 行动卡片 → 证据包。

### 6.5 Nova Assistant (`src/server/chat/`)

| 文件        | 职责                                            |
|-------------|-------------------------------------------------|
| `service.ts`| 对话服务 (线程持久化、多轮记忆、回退) — 26 KB    |
| `tools.ts`  | 内部工具层 (信号、市场、绩效、风险、检索) — 23 KB |
| `prompts.ts`| Prompt 组装 (结构化、证据感知) — 16 KB           |
| `providers/`| 4 个 LLM Provider (Ollama/Gemini/OpenAI/Groq)   |
| `audit.ts`  | 对话审计                                         |

### 6.6 数据摄取 (`src/server/ingestion/`)

| 连接器                   | 数据源                        |
|--------------------------|-------------------------------|
| `massive.ts`             | Massive.com REST API **(主)**  |
| `stooq.ts`               | Stooq 批量 (遗留回退)         |
| `binancePublic.ts`       | Binance 公开批量               |
| `binanceIncremental.ts`  | Binance 增量更新               |
| `binanceDerivatives.ts`  | Binance 衍生品                 |
| `hostedData.ts`          | 托管数据源                     |
| `yahoo.ts`               | Yahoo Finance                  |
| `nasdaq.ts`              | Nasdaq                         |
| `normalize.ts`           | 数据归一化管线                 |
| `validation.ts`          | 数据质量验证                   |

### 6.7 Alpha 发现系统 (6 个模块)

```
alpha_discovery/     → 自动 Alpha 发现循环
alpha_registry/      → 生命周期注册 & 追踪
alpha_evaluator/     → 代理回测评估 & 拒绝门
alpha_mutation/      → 突变 / 简化优化
alpha_shadow_runner/ → Shadow 模式观察
alpha_promotion_guard/ → 晋升守卫 (Shadow → Canary → Prod)
```

### 6.8 Marvix LLM 运行时 (`src/server/nova/`)

| 文件            | 职责                             |
|-----------------|----------------------------------|
| `service.ts`    | Nova 服务 (任务日志、路由)        |
| `client.ts`     | Ollama 客户端                    |
| `router.ts`     | 模型路由 (Core/Scout/Retrieve)   |
| `health.ts`     | 健康检查                         |
| `flywheel.ts`   | 策略飞轮                         |
| `strategyLab.ts`| 策略实验室                       |
| `training.ts`   | MLX 训练导出                     |
| `mlx.ts`        | MLX-LM 集成                     |

---

## 7. 前端架构

### 7.1 技术选型

- **框架**: React 18 + Vite 5 (SPA)
- **样式**: 纯 CSS (`styles.css`, 314 KB)
- **路由/状态**: App.jsx 内 Tab 编排 (无第三方路由)
- **代码分割**: `React.lazy` 用于次级 Tab 组件
- **国际化**: `i18n.js` (中/英双语)

### 7.2 主要组件 (29 个)

| 组件                | 职责                   | 大小     |
|---------------------|------------------------|----------|
| `App.jsx`           | 产品壳 & Tab 编排      | 106 KB   |
| `TodayTab.jsx`      | 今日决策面板 (首页)     | 49 KB    |
| `MenuTab.jsx`       | 设置 & 高级功能         | 70 KB    |
| `BrowseTab.jsx`     | 资产浏览 & 搜索         | 41 KB    |
| `HoldingsTab.jsx`   | 持仓管理                | 28 KB    |
| `OnboardingFlow.jsx`| 首次引导流              | 27 KB    |
| `ResearchTab.jsx`   | AI 研究工具             | 25 KB    |
| `ProofTab.jsx`      | 证据 & 回测             | 23 KB    |
| `SignalsTab.jsx`    | 信号列表                | 21 KB    |
| `AiPage.jsx`        | Nova 助手对话页         | 16 KB    |
| `RiskTab.jsx`       | 风险仪表盘              | 13 KB    |

### 7.3 Hooks

| Hook                   | 功能                   |
|------------------------|------------------------|
| `useNovaAssistant.js`  | Nova 助手交互状态       |
| `useDemoAssistant.js`  | Demo 模式助手           |
| `useLocalStorage.js`   | 本地存储封装            |

### 7.4 工具函数 (`src/utils/`)

`api.js` (API 客户端)、`tradeIntent.js` (交易意图解析)、`holdingsSource.js` (持仓数据源)、`browseWarmup.js` (浏览预热)、`assistantLanguage.js` (助手语言)、`format.js`、`provenance.js`、`downloads.js`

---

## 8. 量化引擎管线 (`src/engines/`)

| 引擎                      | 职责                          | 大小     |
|---------------------------|-------------------------------|----------|
| `signalEngine.js`         | 信号生成 & 评分 (核心)        | 21 KB    |
| `velocityEngine.js`       | 动量 / 速度跟踪              | 11 KB    |
| `strategyTemplates.js`    | 策略模板注册                  | 11 KB    |
| `funnelEngine.js`         | 信号过滤漏斗                  | 10 KB    |
| `pipeline.js`             | 完整管线编排                  | 7 KB     |
| `riskEngine.js`           | 风险评分                      | 6 KB     |
| `riskGuardrailEngine.js`  | 风险防护栏                    | 6 KB     |
| `performanceEngine.js`    | 绩效测量                      | 5 KB     |
| `regimeEngine.js`         | 市场状态/体制分类             | 3 KB     |
| `math.js`                 | 数学工具                      | 4 KB     |
| `params.js`               | 引擎参数                      | 3 KB     |

---

## 9. 研究 & 治理系统 (`src/research/`)

```
src/research/
├── core/              # 研究核心
├── copilot/           # AI 研究副驾驶
├── discovery/         # 策略发现
├── evidence/          # 证据系统
├── governance/        # 研究治理
├── reliability/       # 可靠性检验
├── validation/        # 验证管线
├── weekly_cycle/      # 周度研究循环
├── holdingsAnalyzer.js        # 持仓分析器
├── multiAssetPipeline.js      # 多资产管线
└── dataQualityChecks.js       # 数据质量检查
```

---

## 10. 管理后台 (`admin/`)

独立 Vite 应用，包含以下页面:

| 页面                       | 职责                               |
|----------------------------|------------------------------------|
| `OverviewPage.jsx`         | 系统概览仪表盘                     |
| `SystemHealthPage.jsx`     | 系统健康监控                       |
| `ResearchOpsPage.jsx`      | 研究运维 (工作流、数据摄取、Alpha) |
| `AlphaLabPage.jsx`         | Alpha 实验室                       |
| `UsersPage.jsx`            | 用户管理                           |
| `SignalsExecutionPage.jsx` | 信号与执行监控                     |

---

## 11. 数据存储架构

```
┌────────────────────────┐     ┌──────────────────────┐
│     SQLite (quant.db)  │     │     Postgres (Auth)  │
│  ──────────────────    │     │  ──────────────────  │
│  ohlcv_bars            │     │  users               │
│  runtime_state         │     │  sessions            │
│  decision_snapshots    │     │  roles               │
│  chat_threads          │     │  password_resets      │
│  chat_messages         │     │  user_state_sync     │
│  evidence_runs         │     └──────────────────────┘
│  manual_signals        │
│  alpha_candidates      │     ┌──────────────────────┐
│  alpha_evaluations     │     │  Upstash Redis       │
│  alpha_shadow_obs      │     │  (遗留认证路径)      │
│  alpha_lifecycle       │     └──────────────────────┘
│  engagement_state      │
│  ...                   │
└────────────────────────┘
```

---

## 12. 部署 & 运维

### 12.1 Vercel 部署

| 目标     | 入口                           | 路由规则                 |
|----------|--------------------------------|--------------------------|
| 前端     | `vite build → dist/`           | SPA 静态                 |
| API      | `api/index.ts`                 | `/api/:route*` → 代理    |
| Admin    | `admin/` (独立 Vite)            | —                        |

`vercel.json` 配置 1024 MB 内存，30s 超时。

### 12.2 EC2 / VPS 部署

- `npm run start:api` + `SERVE_WEB_DIST=1` 单机部署
- `deployment/aws-ec2/` — AWS EC2 部署脚本
- `deployment/vultr/` — Vultr 部署脚本
- `deployment/launchd/` — macOS launchd 守护进程

### 12.3 关键运维脚本 (`scripts/`)

| 脚本                        | 用途                               |
|-----------------------------|------------------------------------|
| `auto-backend.ts`           | 自动化后端运维循环                 |
| `auto-quant-engine.mjs`     | 自动化量化引擎 (91 KB)            |
| `backfill.ts`               | 数据回填                           |
| `db-init.ts` / `db-migrate.ts` | 数据库初始化 & 迁移             |
| `derive-runtime-state.ts`   | 运行时状态推导                     |
| `massive-smoke-test.ts`     | Massive API 冒烟测试               |
| `run-alpha-discovery.ts`    | Alpha 发现循环                     |
| `run-evidence.ts`           | 证据引擎执行                       |
| `run-nova-strategy-lab.ts`  | 策略实验室                         |
| `migrate-auth-to-postgres.ts`| 认证迁移到 Postgres              |
| `package-source.mjs`        | 源码打包 (DD 用)                   |
| `version-manager.mjs`       | SemVer 版本管理                    |

---

## 13. 测试体系

- **框架**: Vitest 4 + Supertest
- **测试文件**: 104 个 (均在 `tests/` 目录)
- **覆盖率**: `@vitest/coverage-v8`

**覆盖领域**: 决策引擎、信号引擎、风控引擎、证据引擎、参与引擎、API 路由、认证、CORS、缓存隔离、Nova 客户端、Alpha 发现、Massive 摄取、持仓导入、手动信号、新闻提供、组合模拟、策略发现、置信度校准、数学边界等。

```bash
npm test                    # 运行全部测试
npm run test:data           # 数据层测试
npm run verify              # 完整验证管线
npm run stress:reliability  # 可靠性压力测试
```

---

## 14. 运行时状态标签

API/运行时输出使用的显式状态标签:

| 标签               | 含义                     |
|--------------------|--------------------------|
| `DB_BACKED`        | 数据库支撑               |
| `REALIZED`         | 已实现                   |
| `MODEL_DERIVED`    | 模型推导                 |
| `PAPER_ONLY`       | 仅纸上交易               |
| `BACKTEST_ONLY`    | 仅回测                   |
| `EXPERIMENTAL`     | 实验性                   |
| `DISCONNECTED`     | 未连接                   |
| `INSUFFICIENT_DATA`| 数据不足                 |
| `DEMO_ONLY`        | 仅演示                   |

---

## 15. 文案 & 感知层

- **文案操作系统**: `src/copy/novaCopySystem.js` (52 KB) — 品牌声音宪法、状态到文案选择器
- **感知层**: 让产品感觉像一个新的 AI 判断表面，而非传统金融仪表盘
- **国际化**: `src/i18n.js` (21 KB) — 中英双语

---

## 16. 环境变量一览

| 变量                      | 用途                        |
|---------------------------|-----------------------------|
| `DATABASE_URL`            | Postgres 认证 (生产)        |
| `MASSIVE_API_KEY`         | Massive.com 数据 API        |
| `ALPHA_VANTAGE_API_KEY`   | 股票/ETF 搜索增强           |
| `COINGECKO_*_API_KEY`     | 加密货币搜索增强             |
| `KV_REST_API_*`           | Upstash Redis (遗留)        |
| `NOVA_ALPHA_DISCOVERY_*`  | Alpha 发现循环配置           |
| `GEMINI_API_KEY`          | Google Gemini LLM           |
| `OPENAI_API_KEY`          | OpenAI LLM                  |
| `GROQ_API_KEY`            | Groq LLM                    |
| `DB_PATH`                 | 自定义 SQLite 路径           |
| `SERVE_WEB_DIST`          | EC2 单机部署模式             |

---

## 17. 快速启动

```bash
# 首次克隆
npm ci
npm run db:init
npm run backfill -- --market CRYPTO --tf 1h
npm run validate:data -- --tf 1h --lookbackBars 800
npm run derive:runtime
npm run api:data     # 另一个终端
npm run dev          # 启动前端

# 质量门
npm test && npm run lint && npm run typecheck && npm run build && npm run verify
```

---

## 18. 文档索引

全部技术文档位于 `docs/` (75+ 文件)。核心文档:

| 文档                                    | 内容                   |
|-----------------------------------------|------------------------|
| `SYSTEM_ARCHITECTURE.md`                | 系统架构               |
| `NOVA_ASSISTANT_ARCHITECTURE.md`        | 助手架构               |
| `DECISION_ENGINE.md`                    | 决策引擎               |
| `ENGAGEMENT_SYSTEM.md`                  | 参与系统               |
| `QUANT_RESEARCH_DOCTRINE.md`            | 量化研究方法论         |
| `REPOSITORY_OVERVIEW.md`               | 仓库概览               |
| `REPO_RUNBOOK.md`                       | 运维手册               |
| `TECHNICAL_DUE_DILIGENCE_GUIDE.md`     | 技术尽调指南           |
| `MARVIX_SYSTEM_ARCHITECTURE.md`         | Marvix 系统架构       |
| `AWS_EC2_DEPLOYMENT.md`                | EC2 部署指南           |

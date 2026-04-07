# Nova Quant — Architecture Overview

> 自动扫描生成 · 最后更新: 2026-04-07
> Version: 10.22.32 (build 113) — 与 `package.json` / `src/config/version.js` 保持一致

---

## 1. 定位

Nova Quant 是一个 **AI-native 量化决策平台**，面向美股与加密货币的自主交易者。
核心理念是帮助用户 **减少情绪化交易、以纪律执行**，而不是一个自动交易机器人或虚假绩效展示工具。

---

## 2. 双层 / 四面部署拓扑

```
nova-quant/
├── landing/        → 公开前端 (Vercel)           → novaquant.cloud
│   └── data-portal → 公共数据门户                → novaquant.cloud/data-portal
├── app/            → 登录后用户前端 (Vercel)     → app.novaquant.cloud
├── admin/          → 内部管理前端 (Vercel)       → admin.novaquant.cloud
├── api/            → Serverless 入口             → api.novaquant.cloud
├── model/          → EC2 模型边界 & 信号合约
└── qlib-bridge/    → EC2 Python 侧车 (因子 / 推理)
```

系统心智不是“4 个互相独立的 mono-repo”，而是“1 个仓库里的前后端双层系统”。

- 前端层：`landing/`、`app/`、`admin/`
- 后端层：repository root API、`qlib-bridge/`

**运行时规则**:
| 层 | 允许 | 禁止 |
|----------|--------------------------|--------------------------|
| `landing/` | 公开内容、登录/注册入口、套餐展示 | 登录后主应用、管理员能力、直连数据库 |
| `app/` | 登录后用户主应用，只调用 API | 营销主页、管理员页面、直连数据库 |
| `admin/` | 内部运营与管理，只调用 API | 普通用户主流程、直连数据库 |
| API 层 | 读写数据库、响应 API 请求、处理鉴权/支付/webhook | 渲染前端页面或承担主页入口 |
| `model/` | 推送标准信号到 server | 触碰用户数据 |
| `qlib-bridge/` | 接受 HTTP 请求，读 Supabase/Postgres 同步并算因子 | 触碰用户状态或主动写入 DB |

**域名规则**:

- `novaquant.cloud` 只服务 `landing/`
- `app.novaquant.cloud` 只服务 `app/`
- `admin.novaquant.cloud` 只服务 `admin/`
- `api.novaquant.cloud` 只服务 API

任何“API 也能进主页”的行为都应视为部署或 rewrite 配置错误。

---

## 3. 技术栈

| 类别       | 选型                                                      |
| ---------- | --------------------------------------------------------- |
| 前端框架   | React 18 + Vite 8, JSX                                    |
| 后端框架   | Express 5 (TypeScript)                                    |
| 业务数据库 | Supabase Postgres — `NOVA_DATA_DATABASE_URL`              |
| 认证数据库 | Supabase Postgres — `NOVA_AUTH_DATABASE_URL`              |
| 运行时桥接 | Postgres runtime repository + in-memory test harness      |
| 认证体系   | Supabase Native Auth + Postgres profile/session store     |
| 类型检查   | TypeScript 5.9                                            |
| 测试框架   | Vitest 4 + Supertest                                      |
| 部署平台   | Vercel (前端 + API) / AWS EC2 (模型 + 后端自动化)         |
| LLM 运行时 | Ollama (本地 Marvix 模型族) + Gemini / OpenAI / Groq 回退 |
| 图表       | Chart.js + react-chartjs-2                                |
| 数据管道   | Massive.com (主) + Stooq/Binance/Yahoo/Nasdaq 回退        |

---

## 4. 目录结构总览

```
nova-quant/
│
├── src/                          # 核心源码
│   ├── App.jsx                   # 薄编排壳层 — 组合 hooks + 渲染
│   ├── main.jsx                  # React 入口
│   ├── styles.css                # 首屏全局 @import 入口；各 Tab 页面可再自引领域 CSS（配合 lazy chunk）
│   ├── i18n.js                   # 国际化 (中/英)
│   │
│   ├── components/               # 29 个 UI 组件（含 `FirstRunSetupFlow` 等）
│   │   └── icons/               # TabBarIcon, TopBarMenuGlyph
│   ├── hooks/                    # 11 个 React Hooks
│   ├── utils/                    # 前端工具 (API、格式化、意图解析等)
│   ├── copy/                     # 品牌文案操作系统
│   ├── config/                   # 运行时版本 + appConstants
│   ├── styles/                   # CSS 领域模块
│   ├── assets/                   # 静态资源
│   ├── demo/                     # Demo 模式相关
│   │
│   ├── engines/                  # 16 个量化引擎
│   ├── quant/                    # 前端量化辅助 (sample/检索/研究循环等；服务端运行时见 server/quant/)
│   ├── research/                 # 研究治理 & 验证管线
│   ├── data_sources/             # 数据源定义 (Crypto / Equities / Options)
│   ├── dataset_builders/         # 数据集构建
│   ├── feature_factories/        # 特征工厂
│   ├── normalizers/              # 数据归一化
│   ├── training/                 # 多资产训练服务
│   ├── portfolio_simulation/     # 组合模拟
│   │
│   └── server/                   # 后端核心 (41 个子模块)
│       ├── api/                  # API 路由 & 查询层
│       │   ├── app.ts           # Express 应用入口
│       │   ├── queries.ts       # Runtime 查询编排封装
│       │   ├── helpers.ts      # 辅助函数
│       │   ├── authHandlers.ts  # 认证路由处理
│       │   ├── adminHandlers.ts # 管理端路由处理
│       │   ├── modelHandlers.ts # 模型/信号摄入路由
│       │   └── routes/          # 18 个路由子模块
│       │       ├── admin.ts
│       │       ├── auth.ts
│       │       ├── billing.ts
│       │       ├── browse.ts
│       │       ├── chat.ts
│       │       ├── connect.ts
│       │       ├── decision.ts
│       │       ├── engagement.ts
│       │       ├── evidence.ts
│       │       ├── execution.ts
│       │       ├── manual.ts
│       │       ├── market.ts
│       │       ├── membership.ts
│       │       ├── nova.ts
│       │       ├── outcome.ts
│       │       ├── research.ts
│       │       ├── runtime.ts
│       │       └── signals.ts
│       ├── auth/                 # 认证 (Supabase Native / Postgres store)
│       ├── billing/              # 账单及 Stripe 支付集成
│       ├── membership/           # 会员等级网关与订阅状态判断
│       ├── outcome/              # 策略成果判定与解析
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
│       ├── alpha_discovery/       # 自动 Alpha 发现循环
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
│       ├── manual/               # 积分 / 邀请 / VIP 兑换 / 预测游戏（manual_* 表）
│       ├── news/                 # 新闻提供 (Gemini Factors)
│       ├── observability/         # 可观测性脊柱
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
│       ├── pages/                # 页面
│       ├── components/           # 组件
│       ├── hooks/                # Admin Hooks
│       └── services/             # Admin 服务层
│
├── api/                          # Vercel Serverless 函数入口
│   └── index.ts                  # 路由分发 (主 API 入口点)
│
├── model/                        # EC2 模型边界
│   ├── signal.schema.json        # 信号合约 JSON Schema
│   └── README.md
│
├── tests/                        # 约 220+ 个 Vitest 测试文件（全量见 `npm test` 摘要；含 hooks / admin / e2e 等）
├── scripts/                      # 约 37 个运维脚本 (mjs/ts/js)
├── config/                       # 摄取配置
├── docs/                         # 专题设计与运维文档（具体条目以目录为准）
├── deployment/                   # 部署配置 (AWS EC2 / Vultr / launchd)
├── landing/                      # 品牌落地页 (独立 Vite 应用)
│   └── src/
│       ├── App.jsx               # 编排壳 — 组合 hooks + 组件
│       ├── DataPortalApp.jsx     # 数据研究门户应用壳
│       ├── dataPortalMain.jsx    # 数据门户入口
│       ├── data/index.js         # 内容数据 (定价、FAQ、卡片、证言)
│       ├── components/           # 11 个落地页组件
│       │   ├── AskSection.jsx
│       │   ├── DataPortalPage.jsx
│       │   ├── DistributionSection.jsx
│       │   ├── FaqSection.jsx
│       │   ├── Header.jsx
│       │   ├── HeroSection.jsx
│       │   ├── LegalFooter.jsx
│       │   ├── PricingSection.jsx
│       │   ├── ProofSection.jsx
│       │   ├── StatementSection.jsx
│       │   └── VoicesSection.jsx
│       ├── hooks/                # 2 hooks (useStatementFan, useViewportMotion)
│       └── styles/               # CSS 模块
├── data-portal/                  # 数据研究门户 (独立 Vite 应用)
│   └── index.html
│
├── qlib-bridge/                  # Python Sidecar 微服务 (FastAPI)
│   ├── bridge/                   # 因子与模型适配器 (Alpha158/360, LightGBM)
│   ├── models/                   # 预训练模型挂载点 (.pkl)
│   ├── scripts/                  # 运维脚本
│   ├── tests/                    # 测试
│   └── pyproject.toml            # uv 依赖清单 (pyqlib 等)
│
├── data/                         # 数据快照 / 研究输入（不作为运行时主库）
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
│  Binance ──────┼──→ normalize ──→ Supabase/Postgres ──→ 验证       │
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
│    → performanceEngine (绩效测量)                                   │
│    → velocityEngine (动量/速度跟踪)                                  │
│    → patternDetector (形态检测)                                      │
│    → sentimentCycleEngine (情绪周期)                                 │
│    → technicalIndicators (技术指标)                                  │
│    → strategyEvaluator (策略评估)                                     │
│    → strategyLoader (策略加载)                                       │
│    → strategyTemplates (策略模板库)                                   │
│    → pipeline (完整管线编排)                                         │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         决策 & 交付层                                │
│                                                                     │
│  Membership & Billing ──→ 订阅层级与调用限额网关                      │
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
│  TodayTab ──────── 今日决策面板 (主着陆页；行动卡有效期倒计时 pill)   │
│  SignalsTab ─────── 信号列表                                         │
│  HoldingsTab ────── 持仓管理                                        │
│  RiskTab ────────── 风险仪表盘                                      │
│  ProofTab ───────── 证据 & 回测                                     │
│  MarketTab ──────── 市场概况                                        │
│  ResearchTab ────── AI 研究工具                                      │
│  AiPage ─────────── Nova 助手对话                                   │
│  BrowseTab ──────── 资产浏览 & 搜索                                 │
│  MenuTab ────────── 设置 & 高级功能（含积分中心 / 预测游戏 / 邀请等 manual UI）│
│  WeeklyReviewTab ── 周度复盘                                        │
│  OnboardingFlow ─── 注册/登录侧 onboarding                            │
│  FirstRunSetupFlow ─ 登录后首次设置（完成后触发 onboarding 积分领奖）  │
│  DisciplineTab ──── 纪律执行                                        │
│  DataStatusTab ──── 数据状态                                        │
│  LearningLoopTab ── 学习循环                                        │
│  SettingsTab ────── 设置                                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. 后端模块详解

### 6.1 API 层 (`src/server/api/`)

| 文件               | 职责                 |
| ------------------ | -------------------- |
| `app.ts`           | Express 应用入口     |
| `queries.ts`       | Runtime 查询编排封装 |
| `helpers.ts`       | 辅助函数             |
| `authHandlers.ts`  | 认证路由处理         |
| `adminHandlers.ts` | 管理端路由处理       |
| `modelHandlers.ts` | 模型/信号摄入路由    |

**路由子模块 (18 个)**: admin, auth, billing, browse, chat, connect, decision, engagement, evidence, execution, manual, market, membership, nova, outcome, research, runtime, signals

### 6.2 数据库层 (`src/server/db/`)

| 文件                           | 职责                                    |
| ------------------------------ | --------------------------------------- |
| `schema.ts`                    | 业务表 bootstrap SQL                    |
| `repository.ts`                | 同步数据访问层 (CRUD 操作)              |
| `database.ts`                  | 测试用 in-memory runtime 入口           |
| `postgresBusinessMirror.ts`    | Supabase 写镜像 (Proxy 拦截 20+ 写操作) |
| `postgresSql.ts`               | Postgres SQL helpers                    |
| `postgresRuntimeRepository.ts` | Postgres 运行时 Repository              |

**主要运行时表**: `ohlcv_bars`, `runtime_state`, `decision_snapshots`, `chat_threads`, `chat_messages`, `evidence_runs`, `alpha_candidates`, `alpha_evaluations`, `alpha_shadow_observations`, `alpha_lifecycle_events`, `manual_user_state`, `manual_points_ledger`, `manual_referrals`, `manual_prediction_markets`, `manual_prediction_entries`, `manual_checkins`, `engagement_state`, `billing_customers`, `billing_subscriptions` 等（积分与预测玩法详见 `docs/MANUAL_POINTS_AND_PREDICTION.md`）

### 6.3 认证层 (`src/server/auth/`)

| 文件               | 职责                                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service.ts`       | 认证服务 (Session / RBAC / 中间件)；`loginAdminUser` 非 ADMIN 即撤销会话；`getAdminSession` 短 TTL 缓存 + 角色变更失效；`getEffectiveAuthRolesForUser` 供 session/profile 返回角色 |
| `postgresStore.ts` | Postgres 认证存储；`pgGetAdminSessionBundle` 单次查询拉取 session + user + roles 等                                                                                                |
| `supabase.ts`      | 原生 Supabase 认证集成，接管邮件及 Session                                                                                                                                         |

### 6.4 决策引擎 (`src/server/decision/`)

单文件 `engine.ts`，实现了从原始信号到个性化行动卡片的完整决策链：信号 → 资格过滤 → 风险状态 → 组合意图 → 行动卡片 → 证据包。

### 6.5 Nova Assistant (`src/server/chat/`)

| 文件         | 职责                                          |
| ------------ | --------------------------------------------- |
| `service.ts` | 对话服务 (线程持久化、多轮记忆、回退)         |
| `tools.ts`   | 内部工具层 (信号、市场、绩效、风险、检索)     |
| `prompts.ts` | Prompt 组装 (结构化、证据感知)                |
| `providers/` | 4 个 LLM Provider (Ollama/Gemini/OpenAI/Groq) |
| `audit.ts`   | 对话审计                                      |

### 6.6 数据摄取 (`src/server/ingestion/`)

| 连接器                  | 数据源                        |
| ----------------------- | ----------------------------- |
| `massive.ts`            | Massive.com REST API **(主)** |
| `stooq.ts`              | Stooq 批量 (遗留回退)         |
| `binancePublic.ts`      | Binance 公开批量              |
| `binanceIncremental.ts` | Binance 增量更新              |
| `binanceDerivatives.ts` | Binance 衍生品                |
| `hostedData.ts`         | 托管数据源                    |
| `yahoo.ts`              | Yahoo Finance                 |
| `nasdaq.ts`             | Nasdaq                        |
| `normalize.ts`          | 数据归一化管线                |
| `validation.ts`         | 数据质量验证                  |

### 6.7 Alpha 发现系统 (7 个模块)

```
alpha_discovery/      → 自动 Alpha 发现循环
alpha_registry/       → 生命周期注册 & 追踪
alpha_evaluator/     → 代理回测评估 & 拒绝门
alpha_mutation/       → 突变 / 简化优化
alpha_shadow_runner/  → Shadow 模式观察
alpha_promotion_guard/→ 晋升守卫 (Shadow → Canary → Prod)
```

### 6.8 Marvix LLM 运行时 (`src/server/nova/`)

| 文件             | 职责                                         |
| ---------------- | -------------------------------------------- |
| `service.ts`     | Nova 服务 (任务日志、路由)                   |
| `client.ts`      | Ollama 客户端                                |
| `router.ts`      | 模型路由 (Core/Scout/Retrieve)               |
| `health.ts`      | 健康检查                                     |
| `flywheel.ts`    | 策略飞轮                                     |
| `strategyLab.ts` | 策略实验室                                   |
| `training.ts`    | MLX 训练导出                                 |
| `mlx.ts`         | MLX-LM 集成                                  |
| `qlibClient.ts`  | 桥接 Qlib Python Sidecar，提取因子与模型推理 |

### 6.9 量化特征与信号降级 (`src/research/core/`)

| 文件                    | 职责                                                   |
| ----------------------- | ------------------------------------------------------ |
| `featureSignalLayer.js` | 构建信号层并注入 Alpha158 外部算力补全；异常时自动降级 |

---

## 7. 前端架构

### 7.1 技术选型

- **框架**: React 18 + Vite 8 (SPA)
- **样式**: `src/styles/` 领域 CSS；全局入口 `styles.css` 控制首屏 cascade，Today / Nova 等重页面在组件内 `import` 专用表（如 `today-final.css`、`ai-rebuild.css`）
- **路由/状态**: App.jsx 编排 + 11 个 custom hooks (无第三方路由)；主导航为 **Today / Nova / Browse / My** 四 Tab
- **代码分割**: `App.jsx` 对绝大多数 Tab 页面、`FirstRunSetupFlow`、`OnboardingFlow` 及常用弹层（如 `AboutModal`、会员/结账 Sheet）使用 `React.lazy` + `Suspense`，配套 CSS 随 chunk 加载；`src/styles.css` 仅聚合首屏必需的全局样式模块
- **国际化**: `i18n.js` (中/英双语)

### 7.2 主要组件 (29 个)

| 组件                    | 职责                                                                       |
| ----------------------- | -------------------------------------------------------------------------- |
| `App.jsx`               | 薄编排壳 (hooks + 渲染)                                                    |
| `TodayTab.jsx`          | 今日决策面板 (首页；信号有效期与失效说明)                                  |
| `MenuTab.jsx`           | 设置 & 高级功能；积分 / 预测 / 邀请 manual 接线                            |
| `BrowseTab.jsx`         | 资产浏览 & 搜索                                                            |
| `HoldingsTab.jsx`       | 持仓管理                                                                   |
| `OnboardingFlow.jsx`    | 认证侧 onboarding                                                          |
| `FirstRunSetupFlow.jsx` | 登录后首次设置：两步（入口意图 + 市场/风险/关注），localStorage 按用户记录 |
| `ResearchTab.jsx`       | AI 研究工具                                                                |
| `ProofTab.jsx`          | 证据 & 回测                                                                |
| `SignalsTab.jsx`        | 信号列表                                                                   |
| `AiPage.jsx`            | Nova 助手对话页                                                            |
| `RiskTab.jsx`           | 风险仪表盘                                                                 |
| `MarketTab.jsx`         | 市场概况                                                                   |
| `WeeklyReviewTab.jsx`   | 周度复盘                                                                   |
| `DisciplineTab.jsx`     | 纪律执行                                                                   |
| `LearningLoopTab.jsx`   | 学习循环                                                                   |
| `SettingsTab.jsx`       | 设置                                                                       |
| `DataStatusTab.jsx`     | 数据状态                                                                   |

### 7.3 Hooks (11 个)

| Hook                       | 功能                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| `useAuth.js`               | 认证生命周期；应用会话 `roles` / `isAdmin`                        |
| `useBilling.js`            | 全站订阅层级与计费门户状态同步                                    |
| `useAppData.js`            | 多端点并行数据加载 + 自动刷新                                     |
| `useEngagement.js`         | 参与/纪律/执行记录；manual state 与 VIP/预测/邀请/onboarding POST |
| `useInvestorDemo.js`       | 投资者 Demo（需构建开关 + ADMIN 会话）                            |
| `useNavigation.js`         | Tab/栈导航 & AI 路由                                              |
| `useNovaAssistant.js`      | Nova 助手交互状态                                                 |
| `useDemoAssistant.js`      | Demo 模式助手                                                     |
| `useLocalStorage.js`       | 本地存储封装                                                      |
| `useMembership.js`         | 会员状态同步                                                      |
| `useControlPlaneStatus.js` | 控制面板状态                                                      |

### 7.4 工具函数 (`src/utils/`)

`api.js`（含本地开发下多候选 API base 与 404/405/HTML 回退）、`apiBase.js`（运行时 base 列表）、`tradeIntent.js`、`holdingsSource.js`、`browseWarmup.js`、`assistantLanguage.js`、`format.js`、`provenance.js`、`downloads.js`

### 7.5 会话、演示与本地 API 发现

- **会话载荷：** 服务端 `handleAuthSession` / `handleGetAuthProfile` 在 `authenticated` 响应中带 `roles: string[]` 与 `isAdmin: boolean`（`getEffectiveAuthRolesForUser` 合并数据库角色行与 `NOVA_ADMIN_EMAILS` / `NOVA_OWNER_EMAIL` 等环境解析）。前端登录成功后写入 `authSession.roles` / `isAdmin`。
- **投资者演示：** 入口由 `VITE_ENABLE_DEMO_ENTRY` 控制（`!== '0'` 时允许展示入口）；**实际启用**还需当前用户 `isAdmin === true`，否则 `useInvestorDemo` 会关闭演示并恢复备份数据。
- **本地联调：** 当前端与 API 基地址不一致时，`fetchApi` 可对 `/api/*` 在 404、405 或 HTML 响应时尝试下一候选 base（含生产 API 主机名），减少「只起 Vite、未起本地 API」时的假失败。

---

## 8. 量化引擎管线 (`src/engines/`)

| 引擎                      | 职责                   |
| ------------------------- | ---------------------- |
| `signalEngine.js`         | 信号生成 & 评分 (核心) |
| `velocityEngine.js`       | 动量 / 速度跟踪        |
| `strategyTemplates.js`    | 策略模板注册           |
| `funnelEngine.js`         | 信号过滤漏斗           |
| `pipeline.js`             | 完整管线编排           |
| `riskEngine.js`           | 风险评分               |
| `riskGuardrailEngine.js`  | 风险防护栏             |
| `performanceEngine.js`    | 绩效测量               |
| `regimeEngine.js`         | 市场状态/体制分类      |
| `math.js`                 | 数学工具               |
| `params.js`               | 引擎参数               |
| `patternDetector.js`      | 形态检测               |
| `sentimentCycleEngine.js` | 情绪周期               |
| `technicalIndicators.js`  | 技术指标               |
| `strategyEvaluator.js`    | 策略评估               |
| `strategyLoader.js`       | 策略加载               |

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
├── holdingsAnalyzer.js       # 持仓分析器
├── multiAssetPipeline.js     # 多资产管线
└── dataQualityChecks.js      # 数据质量检查
```

---

## 10. 管理后台 (`admin/`)

独立 Vite 应用，通过 `postgresBusinessRead.ts` 从 Supabase/Postgres 读取数据。

---

## 11. 品牌落地页 (`landing/`)

独立 Vite + React 单页应用，部署于 `novaquant.cloud`。

### 组件 (11 个)

| 组件                      | 职责                               |
| ------------------------- | ---------------------------------- |
| `Header.jsx`              | 玻璃拟态导航条，滚动时压缩         |
| `HeroSection.jsx`         | Warhol 色调主视觉，视差滚动        |
| `StatementSection.jsx`    | 交互式扇形卡片堆叠                 |
| `ProofSection.jsx`        | Marvix 架构流图                    |
| `AskSection.jsx`          | Ask Nova 展示                      |
| `PricingSection.jsx`      | 4 档定价卡片 (Free/Lite/Pro/Ultra) |
| `FaqSection.jsx`          | FAQ 手风琴                         |
| `VoicesSection.jsx`       | 首批用户证言                       |
| `DistributionSection.jsx` | 分发渠道 & 致谢                    |
| `LegalFooter.jsx`         | 法律声明、品牌、监管免责           |
| `DataPortalPage.jsx`      | 数据研究门户页面                   |

### Hooks (2 个)

| Hook                   | 功能                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `useStatementFan.js`   | ResizeObserver 驱动卡片缩放 + 三阶段 reveal 状态机 (`pre` → `animating` → `settled`)                                                       |
| `useViewportMotion.js` | `useViewportReveal` (IO 入场检测)、`useScrollProgress` (滚动进度)、`useMotionPreference` (media query 追踪，支持 `prefers-reduced-motion`) |

### 数据研究门户 (`data-portal/`)

独立子应用，包含 Backtest、Flywheel、Data Fabric / Audit Loop、Analytics 等分析模块。

---

## 12. 数据存储架构

```
┌────────────────────────┐     ┌──────────────────────┐
│  Postgres (Business)   │     │     Postgres (Auth)  │
│  ──────────────────   │     │  ──────────────────  │
│  ohlcv_bars           │     │  users               │
│  runtime_state        │     │  sessions            │
│  decision_snapshots   │     │  roles               │
│  chat_threads         │     │  password_resets     │
│  chat_messages        │     │  user_state_sync     │
│  evidence_runs        │     └──────────────────────┘
│  manual_signals       │
│  alpha_candidates     │     ┌──────────────────────┐
│  alpha_evaluations    │     │  Supabase Postgres   │
│  alpha_shadow_obs    │     │  (业务数据镜像)      │
│  alpha_lifecycle      │     │  ──────────────────  │
│  engagement_state     │     │  全部业务表的镜像    │
│  billing_customers    │     │  via postgresBusinessMirror │
│  billing_subscriptions│     │  写: Proxy 拦截自动同步   │
│  ...                  │     │  读: Admin + API 优先    │
└────────────────────────┘     └──────────────────────┘
```

---

## 13. 部署 & 运维

### 13.1 Vercel 部署

| 目标  | 入口                 | 路由规则              |
| ----- | -------------------- | --------------------- |
| 前端  | `vite build → dist/` | SPA 静态              |
| API   | `api/index.ts`       | `/api/:route*` → 代理 |
| Admin | `admin/` (独立 Vite) | —                     |

### 13.2 EC2 / VPS 部署

- `npm run start:api` + `SERVE_WEB_DIST=1` 单机部署
- `deployment/aws-ec2/` — AWS EC2 部署脚本
- `deployment/vultr/` — Vultr 部署脚本
- `deployment/launchd/` — macOS launchd 守护进程

### 13.3 关键运维脚本 (`scripts/`)

| 脚本                                   | 用途                 |
| -------------------------------------- | -------------------- |
| `auto-backend.ts`                      | 自动化后端运维循环   |
| `auto-quant-engine.mjs`                | 自动化量化引擎       |
| `backfill.ts`                          | 数据回填             |
| `derive-runtime-state.ts`              | 运行时状态推导       |
| `massive-smoke-test.ts`                | Massive API 冒烟测试 |
| `run-alpha-discovery.ts`               | Alpha 发现循环       |
| `run-evidence.ts`                      | 证据引擎执行         |
| `run-nova-strategy-lab.ts`             | 策略实验室           |
| `run-nova-production-strategy-pack.ts` | 生产策略包生成       |
| `run-nova-robustness-training.ts`      | 策略鲁棒性训练       |
| `run-nova-flywheel.ts`                 | Nova 飞轮            |
| `run-evolution-cycle.ts`               | 演化循环             |
| `check-platform-readiness.mjs`         | 平台就绪预检         |
| `package-source.mjs`                   | 源码打包 (DD 用)     |
| `version-manager.mjs`                  | SemVer 版本管理      |
| `check-changelog.mjs`                  | Changelog 校验       |
| `check-commit-msg.mjs`                 | Commit message 校验  |

---

## 14. 测试体系

- **框架**: Vitest 4 + Supertest
- **测试文件**: 约 220+ 个 (均在 `tests/` 目录；含 `tests/hooks/`、`tests/admin/`；不含默认 Vitest 排除的 `tests/pro-env/**`)
- **覆盖率**: `@vitest/coverage-v8`
- **策略与性能**: 默认并行执行；避免无故全局串行。详见 `docs/TESTING.md`（含前端 `src/utils` 工具链测试建议）。

```bash
npm test                    # 运行全部测试
npm run test:data          # 数据层测试
npm run verify             # 完整验证管线
npm run stress:reliability  # 可靠性压力测试
```

---

## 15. 运行时状态标签

| 标签                | 含义       |
| ------------------- | ---------- |
| `DB_BACKED`         | 数据库支撑 |
| `REALIZED`          | 已实现     |
| `MODEL_DERIVED`     | 模型推导   |
| `PAPER_ONLY`        | 仅纸上交易 |
| `BACKTEST_ONLY`     | 仅回测     |
| `EXPERIMENTAL`      | 实验性     |
| `DISCONNECTED`      | 未连接     |
| `INSUFFICIENT_DATA` | 数据不足   |
| `DEMO_ONLY`         | 仅演示     |

---

## 16. 文案 & 感知层

- **文案操作系统**: `src/copy/novaCopySystem.js` — 品牌声音宪法、状态到文案选择器
- **感知层**: 让产品感觉像一个新的 AI 判断表面，而非传统金融仪表盘
- **国际化**: `src/i18n.js` — 中英双语

---

## 17. 环境变量一览

| 变量                           | 用途                                                           |
| ------------------------------ | -------------------------------------------------------------- |
| `NOVA_DATA_DATABASE_URL`       | Supabase 业务数据连接                                          |
| `NOVA_AUTH_DATABASE_URL`       | Supabase 认证数据连接                                          |
| `NOVA_DATA_PG_SCHEMA`          | 业务镜像 Schema (默认 novaquant_data)                          |
| `NOVA_DATA_PG_POOL_MAX`        | 业务镜像连接池大小                                             |
| `NOVA_AUTH_DRIVER`             | 认证驱动 (postgres)                                            |
| `MASSIVE_API_KEY`              | Massive.com 数据 API                                           |
| `ALPHA_VANTAGE_API_KEY`        | 股票/ETF 搜索增强                                              |
| `COINGECKO_API_KEY`            | 加密货币搜索增强                                               |
| `NOVA_ALPHA_DISCOVERY_*`       | Alpha 发现循环配置                                             |
| `GEMINI_API_KEY`               | Google Gemini LLM                                              |
| `OPENAI_API_KEY`               | OpenAI LLM                                                     |
| `GROQ_API_KEY`                 | Groq LLM                                                       |
| `OLLAMA_BASE_URL`              | Ollama 端点 (默认 http://127.0.0.1:11434/v1)                   |
| `STRIPE_SECRET_KEY`            | Stripe 计费门户后端通信密钥                                    |
| `STRIPE_WEBHOOK_SECRET`        | Stripe Webhook 安全验签密钥                                    |
| `SERVE_WEB_DIST`               | EC2 单机部署模式                                               |
| `NOVA_ENABLE_SEEDED_DEMO_USER` | 启用内置演示用户                                               |
| `NOVA_ADMIN_EMAILS`            | 逗号分隔邮箱列表，解析为 `ADMIN` 角色（与会话 `isAdmin` 对齐） |
| `VITE_ENABLE_DEMO_ENTRY`       | 构建时设为 `0` 可隐藏投资者演示入口（仍需 ADMIN 才能启用演示） |

---

## 18. 快速启动

```bash
# 首次克隆
npm ci
npm run backfill -- --market CRYPTO --tf 1h
npm run validate:data -- --tf 1h --lookbackBars 800
npm run derive:runtime
npm run api:data     # 另一个终端
npm run dev          # 启动前端

# 质量门
npm test && npm run lint && npm run typecheck && npm run build && npm run verify
```

---

## 19. 文档索引

专题与深度说明位于 `docs/`（文件数量随迭代变化，不在此硬编码统计）。以下为常用入口示例:

| 文档                                  | 内容            |
| ------------------------------------- | --------------- |
| `SYSTEM_ARCHITECTURE.md`              | 系统架构        |
| `NOVA_ASSISTANT_ARCHITECTURE.md`      | 助手架构        |
| `DECISION_ENGINE.md`                  | 决策引擎        |
| `ENGAGEMENT_SYSTEM.md`                | 参与系统        |
| `QUANT_RESEARCH_DOCTRINE.md`          | 量化研究方法论  |
| `REPOSITORY_OVERVIEW.md`              | 仓库概览        |
| `REPO_RUNBOOK.md`                     | 运维手册        |
| `TECHNICAL_DUE_DILIGENCE_GUIDE.md`    | 技术尽调指南    |
| `MARVIX_SYSTEM_ARCHITECTURE.md`       | Marvix 系统架构 |
| `AWS_EC2_DEPLOYMENT.md`               | EC2 部署指南    |
| `COPY_OPERATING_SYSTEM.md`            | 文案操作系统    |
| `PERCEPTION_LAYER_DIFFERENTIATION.md` | 感知层差异化    |

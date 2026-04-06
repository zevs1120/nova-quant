# Nova Quant 现阶段产品文档（面向专业评审）

更新时间：2026-03-25  
对应版本：`10.5.0`

## 文档目的

这份文档面向专业人士、潜在顾问、资深交易/量化/产品/风控从业者，用来快速回答三个问题：

1. Nova Quant 现在到底已经做成了什么。
2. 哪些能力已经进入真实产品路径，哪些仍然停留在实验或骨架阶段。
3. 接下来最该补的功能是什么，产品应朝哪个方向演进。

本文基于当前仓库代码、API、管理后台、测试与现有架构文档整理，不是理想化 roadmap，也不是营销材料。

## 1. 执行摘要

Nova Quant 现阶段不是一个“看行情的金融面板”，也不是一个“全自动交易机器人”。它更准确的定义是：

**一个面向美股和加密市场的 AI-native 量化决策平台，目标是把数据、研究、信号、风险约束、执行记录、证据回放和 AI 解释整合成一条可信的决策链。**

当前产品已经具备以下真实骨架：

- 用户端 H5 应用，包含 Today、Nova、Browse、My 四大主入口。
- 后端统一 API、用户认证、会话、风控、决策快照、执行记录、证据引擎、研究接口。
- 内部管理后台，能够查看用户、Alpha 生命周期、研究工作流、系统健康和执行治理。
- Alpha discovery / shadow / canary / prod 的策略生命周期骨架。
- 线程持久化的 AI Assistant，以及在模型不可用时的确定性兜底回答。

但如果从专业视角看，当前阶段的核心判断应是：

**Nova Quant 已经是“架构和产品形态都较完整的早期决策平台”，但还不是“机构级可信执行平台”。**

当前最大的短板不在于页面不够多，而在于以下三类深度能力仍需补齐：

- 真实 outcome 与 replay/paper/live 的闭环归因。
- 事件、成本、滑点、成交等执行真实性。
- 人工治理、签核、晋升 memo 和审计流程的制度化。

## 2. 产品定义与边界

### 2.1 一句话定位

Nova Quant 帮助自主管理资产的交易者和内部研究/运营团队，把“看到机会”变成“有证据、有风控边界、可复盘的动作建议”。

### 2.2 产品边界

现阶段系统边界比较明确：

- 主要市场：`US equities` 和 `crypto`
- 当前更像“决策平台”而非“自动下单平台”
- 默认姿态是诚实的 `paper / disconnected / read-only`
- live broker/exchange routing 虽然有代码路径，但只在显式凭证与 feature flag 打开时启用
- 产品不以伪造实时收益、伪造持仓、伪造执行为卖点
- `options` 目前主要出现在持仓导入和数据结构层，不应被对外表述为成熟的期权交易产品
- `commodity futures` 尚未进入当前主产品范围

### 2.3 部署边界

仓库已经按四段边界拆分：

- `app/`：用户端 H5
- `admin/`：内部管理与 Research Ops
- 仓库根目录：统一 API 与数据库访问层（通过 `api/index.ts` 部署）
- `model/`：EC2 侧模型/信号边界

这个拆分说明产品已经不再是单页 demo，而是在按真实生产边界组织。

## 3. 目标用户与当前适配度

| 用户类型                      | 当前适配度 | 当前价值                                                           | 当前限制                                                       |
| ----------------------------- | ---------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| 自主交易者 / 中高级个人投资者 | 高         | 能得到 Today 判断、信号优先级、持仓检查、AI 问答、周复盘、纪律记录 | 事件与执行真实性仍需加强，不能把它当成“自动赚钱系统”           |
| 内部研究/策略运营人员         | 中高       | 有研究接口、证据引擎、Alpha Lab、Research Ops、训练与工作流监控    | 工作流治理、签核、研究工单持久化还不够完整                     |
| 专业投资团队 / 小型机构       | 中低       | 可以看到产品骨架、审计思路、治理方向和受控执行框架                 | 缺少机构级 execution realism、审批流、审计材料深度和组织化流程 |

从代码形态看，产品当前同时服务两类对象：

- 对外：纪律化的自助决策用户
- 对内：研究与策略运营团队

这是一种有潜力但也有风险的双核心定位。后续需要更明确地决定，是先把“可信决策产品”做深，还是把“研究运营平台”做深。

## 4. 当前已经具备的产品能力

### 4.1 用户端产品面

当前用户端不是单一页面，而是完整的多入口产品：

- `Today`
  - 汇总今日是否该出手、该等待还是先防守
  - 对信号按可执行性、数据状态、置信度、新鲜度进行排序
  - 输出 action bias，而不是只展示原始 signal
- `Nova`
  - 提供线程持久化聊天
  - 根据上下文切换 general coach / context-aware / research-assistant 模式
  - 结构化输出 verdict / plan / why / risk / evidence
- `Browse`
  - 提供资产搜索、市场概览、新闻、价格图、screener、earnings 等发现入口
  - 支持本地 universe 与外部搜索融合
- `My`
  - 包含持仓、信号、周复盘、纪律进度、表现证明、安全边界、数据状态、学习飞轮、设置等页面

这说明产品已经不是“量化后台套个 UI”，而是在构建一套用户决策工作台。

### 4.2 持仓与账户能力

当前已实现的用户状态能力包括：

- 登录、注册、密码重置、session 管理
- 用户档案、风险偏好、watchlist、持仓、执行记录的持久化
- 持仓导入支持：
  - CSV
  - 券商截图识别
  - 只读交易所/券商同步
- 管理端可查看用户活跃度、执行记录、会员/积分/邀请等状态
- **积分与 Prediction Game（后端已落地）**：业务库 `manual_*` 表 + `src/server/manual/service.ts`；锚点 **1000 分 = 1 天 VIP**；注册/onboarding/邀请分阶段、签到、每日 signal 小额奖励、预测市场（`STANDARD` / `FREE_DAILY` / `MAIN`）及管理端结算接口；规则与 API 清单见 **`docs/MANUAL_POINTS_AND_PREDICTION.md`**（积分 FIFO 过期仍为规划项）

这使产品具备了“个性化决策”而不只是“公共信号广播”的基础。

### 4.3 决策引擎与风控引擎

当前后端已经存在明确的决策层，而不是把 raw signals 直接推到前端：

- 根据市场、资产类别、风险档位、持仓、执行历史生成 `decision_snapshots`
- 生成排序后的 `action cards`
- 对每条动作附带：
  - 置信度
  - 风险说明
  - data/source status
  - evidence lineage
  - publication gate 判定
- 风险治理层会决定某个信号是 `ACTIONABLE`、`WATCH` 还是 `REJECTED`

这部分是 Nova Quant 目前最像“产品核心发动机”的地方。

### 4.4 执行、对账与治理

执行层已经不是空白：

- 支持 `PAPER` 和 `LIVE` 两种 execution mode
- 有 execution governance、kill switch、reconciliation、order status、cancel order 等接口
- live order 需要认证、provider 归属校验和 feature flag
- 默认不会伪造买入力、持仓或成交

这意味着产品已经有“向真实执行延展”的代码骨架，但默认姿态仍然是受控、谨慎和偏 paper 的。

### 4.5 AI Assistant

AI 不是孤立聊天框，而是接入了产品上下文：

- 统一 `/api/chat` 路径
- 持久化 `chat_threads` 和 `chat_messages`
- 基于信号、市场、持仓、research context 组装上下文
- provider 支持 fallback
- 当模型不可用时，回退到证据驱动的确定性回答

这让 AI 在现阶段更像“证据解释层”和“决策沟通层”，而不是独立的内容生成器。

### 4.6 研究、证据与回放

研究与证据层已经具备独立产品价值：

- Evidence Engine 可运行证据任务
- 有 backtests、signal evidence、reconciliation、champion strategy 等接口
- 支持 replay 风格的回放和执行假设建模
- 研究 API 覆盖：
  - factors
  - regimes
  - diagnostics
  - validation report
  - turnover cost
  - failed experiments
  - workflow
  - explain signal / explain no signal

这部分说明 Nova Quant 不只是“前台显示建议”，而是已经有了较成体系的研究基础设施。

### 4.7 Alpha Discovery 与生命周期管理

仓库中已经实现一条内部 Alpha 生命周期骨架：

- hypothesis/template 驱动的 candidate generation
- alpha mutation / evaluation
- shadow runner
- promotion guard
- registry persistence
- admin 端 Alpha Lab 展示 lifecycle、correlation、decay watch、state transitions

这部分非常适合对外表述为：

**我们已经具备“策略发现到影子观察再到受控晋升”的产品雏形，但还没有把它包装成完全自动化、机构级可信的生产线。**

### 4.8 管理后台与运营视角

当前内部管理台已有 6 个核心页面：

- Overview
- Users
- Alpha Lab
- Signals & Execution
- Research Ops
- System Health

这说明产品已经把内部运营需求纳入系统，而不是只做用户端 UI。

## 5. 什么已经是真实产品能力，什么仍然偏实验

| 层级           | 已经进入真实产品路径                                                            | 仍然偏实验、半成品或内部能力                                               |
| -------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 用户应用       | Today、Browse、Nova、My 已具备完整产品入口                                      | 用户长期留存机制、native widget/notification 还未真正交付                  |
| 数据与运行时   | Supabase/Postgres + ingestion + runtime derivation + status transparency 已落地 | 某些高级研究结果仍带有 model-derived / partial synthetic 性质              |
| 决策系统       | 决策快照、action card、risk gate、portfolio context 已存在                      | 事件驱动风险、结果归因深度还不够                                           |
| 执行系统       | paper/live execution path、kill switch、reconciliation 接口已存在               | 成本、滑点、成交、venue calibration 仍需加强                               |
| AI 能力        | 线程持久化、上下文装配、provider fallback、deterministic fallback 已可用        | structured tool calling、citation coverage、评估台还不够成熟               |
| 研究系统       | 因子/状态/诊断/证据/工作流接口已形成体系                                        | factor-level artifact、workflow artifact、seed policy enforcement 还不够深 |
| Alpha 生命周期 | discovery、shadow、canary/prod registry 与 admin 面板已存在                     | human sign-off、promotion memo、review workflow 尚未完全制度化             |
| 连接器         | Alpaca/Binance adapter 已有真实接口姿态                                         | broker OAuth、生产级运营化、异常恢复与流程化接入仍不完整                   |

专业人士如果只用一句话评价这一阶段，可以说：

**“它已经跨过了 demo 阶段，但还处于从 early platform 向可信产品化平台过渡的中段。”**

## 6. 现阶段最缺的功能

以下是结合当前代码状态，最值得优先补齐的功能缺口。

### P0：先补可信度，而不是先补更多页面

1. **事件 intelligence 正式入库**
   - 当前缺口：earnings、macro、revision、calendar 风险还没有成为一等公民
   - 影响：Today 判断和 action ranking 容易缺少事件维度
   - 建议：先把事件数据变成可持久化、可回放、可解释的对象，再接入 decision engine

2. **decision -> replay/paper/live outcome 的闭环归因**
   - 当前缺口：每个 top action 还不能稳定回答“后来发生了什么，为什么对/错”
   - 影响：产品难以建立长期可信度
   - 建议：把 `decision_snapshots`、replay、paper、shadow outcome 做统一 outcome ledger

3. **成本、滑点、成交真实性升级**
   - 当前缺口：虽然已有 execution profile，但还不够 venue-aware / time-window-aware
   - 影响：回测、paper、live 之间仍可能存在无法解释的偏差
   - 建议：先从 crypto perp 和主要股票执行场景做 calibration profile

4. **人工治理与签核**
   - 当前缺口：策略晋升更多还是系统逻辑，缺少 reviewer identity、approval state、memo artifact
   - 影响：很难拿给机构、专业 PM、风控负责人做正式审视
   - 建议：把 promotion memo、review checklist、rollback path 变成强约束

5. **AI Assistant 的显式工具调用与引用覆盖**
   - 当前缺口：现在更像 prompt-routed context assembly
   - 影响：专业人士会担心 unsupported claims
   - 建议：把 tool calls、evidence citation、claim coverage 变成可检查对象

### P1：把研究系统从“有骨架”升级到“可运营”

1. **factor-level measured evidence**
   - 当前缺口：因子测量深度、regime-sliced artifact 还不够沉淀化
   - 建议：补 rank-IC、quantile spread、by-regime diagnostics 的持久化对象

2. **research workflow artifact persistence**
   - 当前缺口：假设、验证计划、reject/ship rationale 还没有全部成为一等研究资产
   - 建议：把 hypothesis -> experiment -> validation -> decision 做完整 lineage

3. **degradation watch 与 lifecycle governance dashboard**
   - 当前缺口：Alpha Lab 有展示，但治理动作和制度深度还不够
   - 建议：增加 degradation watch、promotion proposal、demotion reason、review state

4. **native notification / widget delivery**
   - 当前缺口：后端 contract 有了，但真实用户触达层还没真正闭环
   - 建议：在不破坏“非 FOMO”哲学的前提下，把提醒系统真正交付出去

### P2：在可信度补足后再扩边界

1. **更完整的 broker/exchange onboarding**
   - 包括 OAuth、生产级凭证管理、错误恢复、权限说明和合规文案

2. **commodity futures 等新资产类扩展**
   - 只有在当前 equities/crypto 的真值链条跑顺后才值得扩展

3. **更强的 workflow orchestration**
   - 当前 durable workflow 有合同和持久化，但还没有独立调度器级执行深度

## 7. 产品发展方向建议

### 方向一：把 Nova Quant 定位成“可信决策平台”

这是我认为最适合现阶段代码现实的主方向。

核心主张不是“帮你自动交易”，而是：

**帮你把研究判断、风险边界、执行记录和复盘证据放在同一条可信链路里。**

这条方向与当前代码最一致，因为你们已经在以下能力上打了基础：

- 决策快照
- 风险治理
- 证据回放
- 执行记录
- 线程化 AI 解释
- 管理后台与策略生命周期

### 方向二：逐步演进成“研究运营系统”

如果你们希望未来服务更专业的团队，那么第二增长曲线应该是：

**把 Nova Quant 从用户产品，扩成研究、验证、晋升、监控、训练的一体化操作系统。**

这条方向的前提不是继续堆更多模型，而是把下列对象做实：

- hypothesis
- experiment
- validation artifact
- promotion memo
- reviewer sign-off
- degradation watch
- outcome review

### 方向三：最后才是“受控执行平台”

live execution 方向是有潜力的，但不建议在当前阶段把它作为最先对外承诺的卖点。

更稳妥的路径是：

1. 先把 decision truth path 做实。
2. 再把 replay / paper / live 的偏差解释清楚。
3. 最后只在少数 provider 和少数用户场景下开放受控执行。

## 8. 建议的阶段性路线图

### 阶段 A：可信度升级（未来 2-3 个月）

目标：让每个用户看到的判断都能被回溯、被解释、被复盘。

重点建设：

- event intelligence ingestion
- outcome ledger
- replay/paper/live join
- venue-aware cost/slippage calibration
- assistant structured tool calling

阶段完成标志：

- 每个 top action 都能追踪后续 outcome
- assistant 的关键结论能落到明确证据对象
- backtest 与 paper 的偏差能够按策略/日期解释

### 阶段 B：治理化升级（未来 3-6 个月）

目标：让研究、验证、晋升、退役进入正式治理流程。

重点建设：

- reviewer sign-off
- promotion memo
- workflow artifact persistence
- factor/regime artifacts
- governance dashboard

阶段完成标志：

- 每次策略晋升都有可审计 memo
- 每次拒绝/降级都有理由与证据链接
- Alpha 生命周期不仅可展示，而且可治理

### 阶段 C：受控扩张（未来 6-12 个月）

目标：在可信度和治理都补足后，再扩展真实执行和资产覆盖。

重点建设：

- 更稳健的 broker/exchange onboarding
- real notification delivery
- portfolio replay integration
- selective live routing
- 新资产类扩展

阶段完成标志：

- 至少一个 provider 的 live path 可被严格审计
- portfolio 层结论与 replay 结果一致性显著提高
- 产品可以面向更专业用户群体做小范围真实部署

## 9. 希望专业人士重点给我们的反馈

为了让外部评审更高效，建议他们重点反馈以下问题：

1. 站在专业交易/量化/风控视角，当前最大的可信度短板是什么？
2. 在“事件 intelligence、执行真实性、人工治理”三者中，哪个应排第一优先级？
3. 你们更建议我们先做深“面向交易者的决策产品”，还是先做深“面向团队的研究运营系统”？
4. 当前 live execution 的边界是否合理，还是应该更保守？
5. 哪些功能已经足够形成差异化，哪些功能还只是“看起来完整但不能真正形成壁垒”？
6. 如果只允许未来一个季度做 3 件事，最应该做什么？

## 10. 结论

Nova Quant 现阶段最有价值的地方，不是单个页面或单个模型能力，而是它已经形成了一条较完整的产品主线：

**数据 -> 研究 -> 信号 -> 风险治理 -> 动作建议 -> 执行记录 -> 证据回放 -> AI 解释 -> 后台治理**

这条主线已经跨过了 demo 阶段，值得继续投入。

但如果要让专业人士真正认可，下一阶段最关键的不是“再加更多功能”，而是把以下三件事做深：

- 真值链条
- 执行真实性
- 人工治理

只要这三件事补齐，Nova Quant 的产品方向会非常清晰：先成为可信的量化决策平台，再逐步成为可治理、可审计、可受控执行的研究与交易操作系统。

## 附录：本文对应的当前代码事实

以下事实来自当前仓库快照：

- 当前版本：`10.22.28`（与根目录 `package.json` 一致）
- API 域路由挂载：`18` 个（见 `src/server/api/app.ts` 中 `app.use(*Router)`）
- 管理后台核心页面：`6` 个（定性；以 `admin/src` 为准）
- 顶层 `*Tab.jsx` 用户功能页面：`17` 个（定性；以 `src/components` 为准）
- Vitest：`226` 个测试文件 / `1345` 条用例量级（`npm test` 全量；`tests/pro-env/**` 由 Playwright 跑，默认不进 Vitest）

主要依据文件包括：

- `README.md`
- `src/App.jsx`
- `src/server/api/app.ts`
- `src/server/decision/engine.ts`
- `src/server/evidence/engine.ts`
- `src/server/chat/service.ts`
- `src/server/connect/adapters.ts`
- `src/server/holdings/import.ts`
- `src/server/backbone/service.ts`
- `src/server/admin/service.ts`
- `src/server/admin/liveOps.ts`
- `docs/NEXT_STEPS.md`
- `docs/TECHNICAL_DUE_DILIGENCE_GUIDE.md`
- `docs/WHAT_WAS_ACTUALLY_IMPLEMENTED.md`

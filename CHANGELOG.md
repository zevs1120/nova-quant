# 变更日志

NovaQuant 所有重要变更记录于此。

## 10.14.0 (2026-03-27)

- 发布类型：**minor**（新功能）

- **Feat(landing)：电影级视口驱动动效系统。**
  - 新增 `useViewportMotion.js` hook：`useViewportReveal`（基于 IntersectionObserver 的分区入场检测）和 `useScrollProgress`（滚动位置→进度映射器），用于视差和 reveal 动画。
  - 增强 `useStatementFan.js`，引入三阶段 reveal 状态机（`pre` → `animating` → `settled`）：卡片初始折叠，视口交叉时展开扇形，1.28 秒后稳定。
  - 全部 7 个主要 section（Hero、Statement、Proof、Ask、Pricing、Voices、Distribution）接入 `useViewportReveal` —— 滚动进入时各获 `is-motion-visible` CSS class，触发各区入场关键帧。
  - 新增约 1,100 行 CSS：交错 fade-in + translateY 入场动画，使用 `--xxx-enter-delay` 自定义属性实现逐元素延迟，以及 hover lift、glow overlay 和卡片扇形变换。

- **Fix(landing)：移动端布局与定价卡触控行为修复。**
  - 将所有定价卡 hover/glow/dimming 效果限制在 `@media (hover: hover) and (pointer: fine)` 内，防止触屏设备出现粘滞高亮。
  - 定价面板添加 `touch-action: pan-y`；`onPointerEnter` 中过滤 `pointerType !== 'mouse'`，避免触摸触发卡片选中。
  - 引入 `--mobile-shell-gutter` / `--mobile-shell-gutter-tight` design token，替换 page-shell、header、legal footer 中硬编码的 `100vw - Xrem` 宽度计算。
  - 为 body、voices、statement、pricing、distribution、legal 各 spread 添加 `overflow-x: clip`，消除窄视口水平滚动条。
  - Statement showcase 宽度从 `100vw`（负 margin hack）改为 `100%`，根除溢出源。

- **Fix(landing)：平滑全局动效行为，支持 `prefers-reduced-motion`。**
  - 新增 `useMotionPreference` hook：追踪任意 media query；Hero 用它检测 `prefers-reduced-motion` 或小屏幕，自动切换 "soft motion" 模式（降低视差、放宽 IO 阈值）。
  - `useViewportReveal` 默认放宽：threshold 0.24→0.16、rootMargin −10%→−4%，确保在短视口上更早触发 reveal。
  - `useScrollProgress` 新增 `disabled` 选项；soft-motion 模式下将 progress 固定为 0.22 并停止 scroll 监听。
  - 全局收紧交错延迟：Ask 90→70 ms、Distribution 105→80 ms、Pricing 95→70 ms、Proof 110→70 ms、Voices 100→75 ms。
  - scroll-progress 更新阈值从 0.008 提高至 0.012，减少高频 re-render。

- **Fix(landing)：稳定 Statement 卡片与 Legal 页脚。**
  - `useStatementFan` 与 `activeIndex` 解耦 —— 不再在卡片选中时重新测量，防止 layout thrash。
  - `BBOX_PAD_PX` 从 28 增至 44，防止旋转/缩放/选中卡片被裁剪。
  - scaler 上添加 `translateZ(0)`、slot 上添加 `backface-visibility: hidden` 以提升 GPU 层；移除逐 slot 的 `filter: saturate() brightness()` 过渡，减少合成层与亚像素闪烁。
  - viewport 和 showcase 添加 `overflow-anchor: none`，防止浏览器滚动锚点跳动。
  - Legal 页脚重新设计：背景从绿色调 `#1f3128` 改为深蓝黑 `#0b0d13`，`::after` 装饰替换为顶部渐变发丝线，新增分区线与 `text-transform: uppercase` 品牌处理，移除移动端 border-radius 实现全宽页脚。

- **Fix(landing)：提交后代码审查修复。**
  - `PricingSection`：20 行内联 `matchMedia` hover 检测替换为共享 `useMotionPreference` hook；新增 `useEffect` 在 hover 能力变化时清除高亮（如平板断开键盘）。
  - `StatementSection`：点击外部取消选中范围从整个 `<section>` 收窄至卡片 viewport —— 点击文案区域不再意外取消选中。移除未使用的 `sectionRef`。
  - `useStatementFan`：简化 IntersectionObserver 回调 —— 移除被 `isIntersecting` 已覆盖的冗余 `intersectionRatio >= 0.34` 分支。
  - `useScrollProgress`：在 effect 依赖数组中注释说明 `ref` 的稳定性。

---

## 10.13.0 (2026-03-27)

- 发布类型：**minor**（新功能）

- **Feat(P7)：美股模板技术指标增强 + 结构化失效规则。**
  - **模板增强**：为 5 个美股模板（EQ_VEL、EQ_EVT、EQ_REG、EQ_SWING、OP_INTRADAY）添加 RSI-14、MACD、Bollinger width、MA alignment、bias rate 条件。
  - **结构化失效**：`evaluateStrategy` 通过 `evaluateCondition` 评估 `{field, op, value, label}` 失效规则；NL 字符串失效回退到传统启发式。输出包含 `invalidation_reasons` 数组。
  - **加载器**：`validateTemplate`/`normalizeTemplate` 扩展失效 schema 验证（与 trigger_conditions 一致）。`VALID_OPS` 提升至模块作用域。
  - **YAML 迁移**：`EQ_PULLBACK.yaml` 和 `CR_MOMENTUM.yaml` 的失效条件转换为结构化对象。
  - **测试**：新增 3 个结构化失效评估测试（触发、非触发、NL 向后兼容）。
  - 测试套件：113/113 文件通过、811/811 测试通过。

---

## 10.12.1 (2026-03-27)

- 发布类型：**patch**（内容补充）

- **Feat(P6)：DSA 策略迁移 —— 6 个 A 股策略。**
  - 从 `daily_stock_analysis` 移植：`CN_BULL_TREND`（默认多头）、`CN_SHRINK_PB`（缩量回踩）、`CN_VOL_BREAK`（放量突破）、`CN_MA_CROSS`（均线金叉）、`CN_BOTTOM_VOL`（底部放量）、`CN_SENTIMENT`（情绪周期）。
  - 全部使用 P5 结构化 `{field, op, value, label}` 触发条件 —— 策略加载器自动加载，零代码改动。
  - 4 个 DSA 策略暂缓（缠论、波浪、箱体、一阳夹三阴），等待缺失特征（K 线序列、支撑阻力检测）。
  - 测试套件：113/113 文件通过、803/803 测试通过。

---

## 10.12.0 (2026-03-27)

- 发布类型：**minor**（新功能）

- **Feat(P5)：YAML 规则引擎 —— 结构化触发条件。**
  - **重构 `strategyEvaluator.js`**：新增 `buildConditionContext()`（30+ 扁平化字段，来自 regime/series/technicalIndicators）、`evaluateCondition()`（6 种运算符：`>`、`>=`、`<`、`<=`、`==`、`!=`、`in`）以及 `evaluateLegacyHeuristic()` NL 字符串回退。
  - **结构化条件**：`trigger_conditions` 支持 `{ field, op, value, label }` 对象。全部 9 个内联模板和 2 个 YAML 文件从自然语言字符串迁移至机器可读条件。
  - **P4 集成**：`signalEngine.js` 向 `evaluateStrategy()` 传递 `technicalIndicators`，使 YAML 条件可引用 MACD、RSI、Bollinger、MA alignment、bias rate、volume ratio。
  - **向后兼容**：NL 字符串条件自动回退至传统启发式评估器。
  - **测试**：`strategyEvaluator.test.ts` 新增 14 个测试，覆盖 `evaluateCondition` 运算符、`buildConditionContext` 扁平化、结构化 + 传统双模式评估。
  - 测试套件：113/113 文件通过、788/788 测试通过。

---

## 10.11.0 (2026-03-27)

- 发布类型：**minor**（新功能）

- **Feat(P4)：技术指标库。**
  - **新增 `src/engines/technicalIndicators.js`**：从 DSA 的 `stock_analyzer.py` 移植 10 个纯函数 —— `sma`、`ema`、`emaSeries`、`macd`（12/26/9 含金叉/死叉检测）、`rsi`（Wilder 法, 6 & 14 周期）、`bollingerBands`（20/2σ）、`biasRate`、`volumeRatio`、`maAlignment`（5 态分类）、`computeIndicators`（复合入口）。
  - **OHLCV 窗口扩展至 30**（`params.js` 中 `ohlcv_bar_window`），确保 MACD(26) 在运行时有足够数据。
  - **信号合约扩展（`signalEngine.js`）**：每个 enriched signal 新增 `technical_indicators` 字段，从 `series.bars` 计算。包含 MA alignment、MACD 状态、RSI 值、Bollinger bands、bias rate、volume ratio。纯增量 —— 无破坏性变更。
  - **测试**：`technicalIndicators.test.ts` 新增 32 个测试，覆盖 SMA 正确性、EMA 收敛、MACD 交叉检测、RSI 边界（0-100、超买/超卖）、Bollinger 不变量、bias rate 符号、volume ratio 算术、MA alignment 分类、复合输出结构。
  - **E2E 更新**：`signalEngineScoring.test.ts` P3 E2E 测试新增 `technical_indicators` 存在性、RSI 类型和 bar_count 断言。
  - 测试套件：113/113 文件通过、774/774 测试通过。

---

## 10.10.1 (2026-03-27)

- 发布类型：**minor**（新功能）

- **Feat：多策略评估器 + K 线形态检测。**
  - 借鉴 `daily_stock_analysis` 的 SkillAgent 专家评估模式，适配为引擎驱动（非 LLM）评估。
  - **新增 `strategyEvaluator.js`**：`evaluateStrategy()` 按模板条件（趋势对齐、速度、波动率、避险、成交量、carry）为每个信号评分，分类信号强度为 `strong|moderate|weak|skip`。`aggregateEvaluations()` 计算多策略视角的共识信号和置信度加权分数调整。
  - **新增 `patternDetector.js`**：5 种 K 线形态（改编自 DSA）—— `bullish_engulfing`、`bearish_engulfing`、`hammer`、`doji`、`volume_breakout`（放量突破）。各返回 `{ type, confidence, direction, score_adjustment }`。
  - **信号合约扩展（`signalEngine.js`）**：两个新增量字段 —— `strategy_evaluation`（逐信号结构化评估）和 `detected_patterns`（检测到的 K 线形态）。全部现有字段保留，无破坏性变更。
  - **测试**：`strategyEvaluator.test.ts`（16 测试）、`patternDetector.test.ts`（18 测试）。
  - **回归覆盖更新**：`signalEngineScoring.test.ts`、`strategyTemplatesEdgeCases.test.ts`、`riskGuardrailEdgeCases.test.ts`、`modelIngestApi.test.ts` 新增聚合策略评估结构、真实 K 线形态检测、OCC 期权代码推断（含高行权价合约）、模型摄入期权标准化覆盖。
  - **Bug 修复第三轮 —— 根因闭环**：
    - 美股期权代码推断：用 OCC 规范正则 `/^[A-Z]{1,6}\d{6}[CP]\d{8}$/` 替换脆弱的 `C00/P00` 字符串匹配，涉及 6 处（`modelHandlers.ts`、`strategyTemplates.js`、`signalEngine.js`、`service.ts`）。
    - 移除 `buildSyntheticBars()` —— 防止虚构 K 线几何产生错误形态检测。
    - 严格聚合断言：`strategy_evaluation` 对多模板市场必须产出 `evaluation_count > 1` 的聚合结构。
  - **P3：OHLCV 数据管线（`velocityEngine.js`）**：`generateSyntheticSeries()` 现产出完整 OHLCV（open/high/low/close/volume），含确定性缺口、价差和成交量尖峰逻辑。`buildSeriesState()` 附加尾部 20 根 K 线（`ohlcv_bar_window` 参数）至每个 series，使 `patternDetector.js` 在运行时能产出真实检测。仅含 close 的 `featureSeries` 回退保证 OHLC 不变量（`low ≤ min(o,c)`、`high ≥ max(o,c)`）。
  - **新增测试**：`velocityEngineEdgeCases.test.ts` +5 OHLCV 管线测试；`signalEngineScoring.test.ts` +3 P3 测试。
  - 测试套件：112/112 文件通过、742/742 测试通过（P0 起始为 110/669）。

---

## 10.9.0 (2026-03-27)

- 发布类型：**minor**（新功能）

- **Feat：乖离率防护栏 + 情绪周期因子。**
  - 借鉴 `daily_stock_analysis` 的乖离率核心规则和 `emotion_cycle.yaml` 的情绪周期量化因子。
  - **乖离率防护栏（`riskGuardrailEngine.js`）**：新增 `computeBiasRate()` 度量入场偏离均衡程度（入场到止损距离 × regime 兼容系数）。`buildBiasRateWarnings()` 在 ≥5% 时发出 `'bias_rate_overextended'`（MEDIUM）、≥8% 时发出 `'bias_rate_blocked'`（HIGH），遵循 DSA 核心规则 "乖离率 > 5% 不追高"。
  - **新增 `sentimentCycleEngine.js`**：将市场情绪分为 5 阶段（`cold_bottom`、`warming`、`stable`、`heating`、`euphoria_top`），使用 volume ratio、velocity percentile 和 MA convergence proxy。各阶段产出分数调整：cold = +0.12 奖励（逆向机会），euphoria = -0.15 惩罚（追高风险）。
  - **信号评分集成（`signalEngine.js`）**：情绪调整在核心 `computeSignalScore()` 计算后叠加。enriched signal 新增 `sentiment_cycle` 字段，含 `phase`、`adjustment`、`factors`。
  - **参数（`params.js`）**：新增 `BIAS_RATE_THRESHOLDS`（warning_pct: 5, block_pct: 8）和 `SENTIMENT_CYCLE_PARAMS`（cold_bonus: 0.12, euphoria_penalty: -0.15）。
  - **测试**：`sentimentCycleEngine.test.ts`（22 测试）—— volume ratio、MA convergence、全部 5 阶段、调整边界、`runSentimentCycle` 集成。
  - 现有测试无回归。

---

## 10.8.0 (2026-03-27)

- 发布类型：**minor**（新功能）

- **Feat：YAML 声明式策略加载 + Regime 感知策略路由。**
  - 借鉴 `daily_stock_analysis` 的 SkillManager 零代码策略定义模式和 SkillRouter 的 regime 路由逻辑。
  - **新增 `strategyLoader.js`**：YAML 解析器、验证器、标准化器、目录扫描器和模板合并系统。加载时验证必填字段（`strategy_id`、`strategy_family`、`asset_class`、`market`、`features`、`rules`）。无效文件跳过并警告，不致命。
  - **新增 `strategies/` 目录**：2 个种子 YAML 策略定义 —— `EQ_PULLBACK.yaml`（股票回踩 EMA，源自 DSA 的 `shrink_pullback`）和 `CR_MOMENTUM.yaml`（加密动量延续，源自 DSA 的 `volume_breakout`）。
  - **`regime_tags` 字段**：全部 9 个内置策略模板添加（如 `CR_VEL: ['trending']`、`CR_TRAP: ['high_vol', 'risk_off']`）。YAML 策略同样声明 `regime_tags`。
  - **Regime 感知 `resolveStrategyId(signal, regime)`**：4 级解析（借鉴 DSA SkillRouter）：(1) signal 上显式 `strategy_id` → (2) `regime_tags` 匹配的模板 → (3) `SYMBOL_TO_STRATEGY` 静态映射 → (4) asset class / market 回退。第 2 参数可选 —— 所有现有调用点向后兼容。
  - **`signalEngine.js`**：向 `resolveStrategyId` 传递 regime 快照，启用基于当前市场状态的动态策略选择。
  - **新增依赖**：`js-yaml`。`npm audit fix` 后 0 漏洞。
  - **测试**：`strategyLoader.test.ts`（22 测试）、`strategyTemplatesEdgeCases.test.ts` 更新至 22 测试。
  - 测试套件：109/109 文件通过、669/669 测试通过（之前 106/628）。

---

## 10.7.1 (2026-03-27)

- 发布类型：**patch**

- **Fix：修复 Supabase 镜像与回退一致性 bug（commit c190ad5..c1b66a7 审查）。**
  - **BUG-1 —— 5 个脚本 `flush()` 冗余调用**：`run-alpha-discovery.ts` 等 5 个脚本在 `try` 和 `finally` 中都调用了 `await flush()`。移除 try 中的冗余调用；`finally` 已确保成功/错误路径均 flush。
  - **BUG-2 —— `loadRuntimeStateCorePrimary` 重复 `decodeSignalContract`**：相同信号行被解码两次。提取共享 `decodedSignals` 变量，消除冗余 JSON.parse + 验证。
  - **BUG-3 —— 混合 Postgres 回退路径中 SQLite 行过期**：当部分 Postgres 读取成功、其他回退至 SQLite 时，`loadRuntimeStateCorePrimary` 现在先同步 SQLite，再从刷新后的本地存储读取。
  - **ISSUE-4 —— 混合数据源警告**：部分 Postgres/部分 SQLite 时 `console.warn` 记录各源来源；`data_source` 正确报告 `mixed-postgres-sqlite`。
  - **ISSUE-8 —— evidence 异常被吞没**：`buildDecisionSnapshotFromCorePrimary` 的空 `catch` 块添加 `console.warn`。
  - **BUG-4 —— 镜像队列错误未导致脚本失败**：`flush()` 现在在写入失败时 reject。
  - **BUG-5 —— 主 Postgres 读取可能跑在本地镜像写入前面**：主读取路径现在在查询 Postgres 前 await 待处理的镜像队列。
  - **BUG-6 —— replay-evidence 回退显示过期信号**：终态信号（`EXPIRED`、`INVALIDATED`、`CLOSED`）现已从回退 evidence 排名中排除。
  - **测试**：新增 `postgresFallbackSync.test.ts`（6 测试）、`postgresMirrorConsistency.test.ts`、`evidenceEngine.test.ts` 扩展。

---

## 10.7.0 (2026-03-27)

- 发布类型：**minor**（新功能）

- **Feat：Supabase 业务数据迁移 —— SQLite → Postgres 镜像层。**
  - **迁移工具**（`postgresMigration.ts`、`migrate-business-to-postgres.ts`）：SQLite 全表批量迁移至 Supabase Postgres，含批量 upsert、进度日志、审计脚本（`audit-business-db-migration.ts`）验证行数一致。
  - **写镜像**（`postgresBusinessMirror.ts`）：基于 Proxy 的写拦截器，自动将 20+ SQLite 写操作异步镜像至 Supabase Postgres，含逐表去重队列。`NOVA_DATA_DATABASE_URL` 设置后激活。
  - **Admin 读镜像**（`postgresBusinessRead.ts`）：Admin 面板（System Health、Research Ops、Alpha Lab）优先从 Supabase 读，SQLite 回退。
  - **运行时读取偏好**（`queries.ts`）：API 路由在镜像可用时优先 Supabase 读，减少 EC2/SQLite 依赖。
  - **平台就绪检查**（`check-platform-readiness.mjs`）：预飞脚本验证 Supabase 连接、schema、行数和环境变量。

- **Feat：公开 Alpha 供给入口（研究发现）。**
  - 新增 `publicAlphaSupply.ts`：构建就绪性评分供给报告，匹配公开研究种子假说与策略模板，分类为 `ready_now`、`adapter_quick_win` 或 `blocked_missing_data`。
  - 新增 `runtimeFeatureSupport.js`：运行时特征评估引擎。
  - API 路由 `GET /api/research/alpha-supply`。

- **Fix：EC2 部署对齐与 Admin Alpha 可见性。**
  - 恢复 Admin 中的 live Alpha 可见性（`liveAlpha.ts` —— 636 行独立模块）。Admin `AlphaLabPage.jsx` 重新设计。
  - Admin 和 App 优先使用 EC2 API base URL，修复 Vercel cold start 期间路由错误。

- **Fix：缺失 replay evidence 时回填信号卡片。**
  - Evidence engine 检测缺失的 replay evidence 并从 runtime state 回填信号卡片，确保 Today 和 Proof 始终展示可操作内容。

- 测试套件：106/106 文件通过、628/628 测试通过（之前 102/618）。

---

## 10.5.8 (2026-03-26)

- 发布类型：**patch**
- **Fix：解决 Vercel cold start 时 "System offline" 问题，同时保留持仓用户的个性化决策。**
  - 根因：Vercel serverless 每次 cold start 使用空的 `/tmp` SQLite（0 条 OHLCV bars）。`shouldUsePublicDecisionFallback()` 在用户有持仓时无条件返回 `false`。
  - 修复：重构判断逻辑 —— 有持仓的请求始终走个性化路径（保留 `portfolio_context`）；仅无持仓请求回退至公开 live-scan。

---

## 10.5.7 (2026-03-26)

- 发布类型：**patch**
- **Fix：提取 OnboardingFlow CSS 至全局加载模块。**
  - 根因：OnboardingFlow 视觉样式（~490 行）定义在 `holdings.css` 中，被 Vite code-split 至异步 chunk。首次访客看到完全无样式的登录/注册界面。
  - 修复：创建 `src/styles/onboarding.css`，提取完整 OnboardingFlow CSS；添加至全局 CSS 链。`holdings.css` chunk 从 58 KB 降至 38 KB。

---

## 10.5.6 (2026-03-26)

- 发布类型：**patch**
- **Fix：解决 CSS code-split 级联冲突导致的生产布局崩溃。**
  - 根因：`today-redesign.css` 和 `today-final.css` 被懒加载组件导入，Vite 将其 code-split 至异步 CSS chunk。生产环境中异步 CSS 在全局 `<link>` 之后加载，同优先级规则从全局样式表优先 —— 破坏整个 Today 布局。
  - 修复：将两文件移入全局 `@import` 链。Today CSS chunk 消除（原 35 KB），无视觉回归。

---

## 10.6.0 (2026-03-26)

- 发布类型：**minor**（新功能）
- **Feat(outcome)：决策结果账本 —— 自动绩效归因。**
  - **Outcome Resolver（`resolver.ts`）**：将 `decision_snapshots` 与后续 OHLCV 数据 join，计算 T+1、T+3、T+5 前瞻回报。分类为 `HIT`（≥+0.3%）、`MISS`（≤−0.3%）、`INCONCLUSIVE` 或 `PENDING`。`SHORT` 方向正确反转回报。
  - **API**：`GET /api/outcomes/recent`、`POST /api/outcomes/resolve`。
  - **Auto-Backend 集成**：Outcome resolution 在维护周期中自动运行（最近 7 天）。
  - **前端**：TodayTab "昨日决策" 卡片展示 top 3 结果；ProofTab "Outcome History" 展示完整表格与统计行。
  - **测试**：`outcomeResolver.test.ts`（19 测试）。
  - **Bug 修复**：交易日语义（日历日 → bar 索引）、userId 作用域、`snapshot_date` vs `resolved_at` 显示。

---

## 10.5.5 (2026-03-25)

- 发布类型：**patch**
- **Fix：修复 `App.jsx` 中 `now is not defined` 白屏崩溃。**
  - 根因：v10.4.2 将 30 秒 `now` 定时器移入 TodayTab，但 `useEngagement` 仍引用不存在的 `now` 变量。
  - 修复：替换为 `now: new Date()`。

---

## 10.5.4 (2026-03-25)

- 发布类型：**patch**
- **Fix：落地页移动端布局 —— Statement 卡片、Ask Nova、Distribution credits。**
  - Statement section：≤760px 切换为纵向 flex 布局；卡片扇展示跳出至全视口宽度。
  - Ask Nova section：≤760px 纵向布局；移除限制性 `max-height` 和 `aspect-ratio`。
  - Distribution credits：重构为 `distribution-pair` 配对行，使用 CSS subgrid 保证行级对齐。
  - PC/桌面布局不变。

---

## 10.5.3 (2026-03-25)

- 发布类型：**patch**
- **CI：修复 Prettier 格式化失败并添加 pre-commit 强制。**
  - 修复 9 个文件格式化问题。添加 husky + lint-staged pre-commit hook：暂存文件自动 Prettier 格式化。
- **Fix：解决全部 npm audit 漏洞（5 → 0）。**
  - `picomatch`（高危, ReDoS）通过 `npm audit fix` 解决。
  - `smol-toml`（4 中危, DoS）添加 npm override 修复传递依赖链。

---

## 10.5.2 (2026-03-25)

- 发布类型：**patch**
- **Perf：前后端性能优化冲刺。**
  - **CSS code-split**：5 个 tab CSS 文件（85 KB）从全局 `styles.css` 移至懒加载组件导入。Shell CSS 从 247 KB 降至 162 KB。
  - **TodayTab code-split**：改用 `React.lazy()`，主 chunk 从 314 KB 降至 124 KB。
  - **Vendor splitting**：`vite.config.js` 中 `manualChunks` 分离 react/react-dom 至 `vendor.js`（141 KB），利于长期缓存。
  - **Clock state 下沉**：30 秒 `now` 定时器从 `App.jsx` 移入 TodayTab，消除非 Today tab 时的全树 re-render。
  - **Browse warmup 延迟**：预热请求仅在 Browse tab 激活时发起；轮询间隔 15s → 120s。
  - **Server Cache-Control**：用户作用域 GET 端点添加 `Cache-Control: private, no-store`。
  - **i18n 拆分**：665 行 `i18n.js` 拆分为 `src/locales/en.js` 和 `src/locales/zh.js`。
  - **`getRepo()` 单例化**、**`fetchApi` 快速路径**、**CORS 白名单 `Set.has()` O(1) 匹配**。
  - 测试套件：103/103 文件通过、599/599 测试通过。

---

## 10.5.1 (2026-03-25)

- 发布类型：**patch**
- **Refactor：落地页分解为可维护的组件架构。**
  - `App.jsx` 从 804 行缩减至 44 行 —— 纯编排器。
  - 新增 `data/index.js`（299 行）：7 个内容数组提取为命名导出。
  - 新增 `hooks/useStatementFan.js`（86 行）：ResizeObserver 驱动的卡片扇缩放。
  - 新增 `components/` 目录：10 个 section 组件。
  - `styles.css`（3,697 行）拆分为 `styles/` 下 12 个有序 CSS 模块。
  - 零视觉回归。

---

## 10.5.0 (2026-03-25)

- 发布类型：**minor**（新功能）
- **Docs：新增面向外部审阅的专业产品文档。**
  - 新增 `docs/CURRENT_PRODUCT_DOCUMENT_ZH.md`（436 行）：面向专业审阅者的当前阶段产品文档。
- **Feat：构建品牌落地页作为独立部署单元。**
  - 新增 `landing/` 子项目：Vite + React，独立 `package.json`、`vercel.json`。711 行 JSX、3,125 行手工 CSS，8 个 section。6 个品牌素材。
- **Fix：落地页窄视口布局、Distribution 文案和动效偏好。**
  - Statement 卡片扇 `ResizeObserver` 驱动 fit-to-width 缩放。Pricing 小屏 2×2 网格。Distribution credits CSS subgrid 对齐。`prefers-reduced-motion` 支持。
- **Chore：域名布局从 4 段重构为 5 段部署。**
  - `novaquant.cloud` 现服务落地页；主应用迁至 `app.novaquant.cloud`。CORS 白名单、密码重置链接、邀请链接同步更新。
- **Fix：落地页 header 玻璃拟态渐变泄露修复。**
- **Fix："Distrbution" → "Distribution" 拼写修正。**
- **Fix：`.env` CORS origins 与域名重构同步。**
- **Fix：Node.js 25 下 `executionGovernance.test.ts` fetch mock 加固。**

---

## 10.4.3 (2026-03-24)

- 发布类型：**patch**
- **Feat：Today tab 视口适配布局 —— 单屏无滚动首页。**
  - 全部 Today tab 内容适配单一视口（iPhone SE 至 14 Pro Max），使用 `dvh` + `clamp()` 按视口高度比例缩放。

---

## 10.4.2 (2026-03-24)

- 发布类型：**patch**
- **Fix：修复 `controlPlaneStatus.test.ts` 竞态条件。**
- **Refactor：分解 `src/App.jsx`（2,150 → 955 行，-56%）。**
  - 新增 5 个 hooks：`useAuth.js`（397 行）、`useAppData.js`（218 行）、`useEngagement.js`（371 行）、`useInvestorDemo.js`（189 行）、`useNavigation.js`（106 行）。
  - 新增 `appConstants.js`（163 行）、`TabBarIcon.jsx`、`TopBarMenuGlyph.jsx`。
- **Refactor：模块化 `src/styles.css`（16,813 行 → 12 个领域模块）。**
- 测试套件：102/102 文件通过、591/591 测试通过。

---

## 10.4.1 (2026-03-24)

- 发布类型：**patch**
- **Refactor：从 `App.jsx` 提取内联页面和工具函数（3,088 → 2,149 行，-30%）。**
  - 新增 `date.js`（7 个日期工具函数）、`appHelpers.js`（7 个应用工具函数）。
  - 新增 4 个组件：`DataStatusTab`、`LearningLoopTab`、`SettingsTab`、`DisciplineTab`，均通过 `React.lazy()` code-split。

---

## 10.4.0 (2026-03-24)

- 发布类型：**minor**（新功能）
- **Refactor：拆分 `app.ts`（2,071 行 / 91 路由）为 15 个领域 Express Router 文件 + 共享 helpers。**
  - `app.ts` 缩减至约 210 行：中间件、2 个特殊路由、15 个 router 挂载、错误处理器。
  - 零逻辑变更。102/102 文件通过、591/591 测试通过。

---

## 10.3.5 (2026-03-24)

- 发布类型：**patch**
- 添加 GitHub Actions CI 工作流（`.github/workflows/ci.yml`）：push to `main` 和所有 PR 触发 lint → format check → typecheck → test → build。
- 改进 flaky 测试诊断：`executionGovernance.test.ts` 和 `controlPlaneStatus.test.ts` 失败时记录完整响应。

## 10.3.4 (2026-03-24)

- 发布类型：**patch**
- 全代码库 Prettier 格式化（490 个文件）。统一 2 空格缩进、单引号、尾逗号。无逻辑变更。

---

## 10.3.3 (2026-03-24)

- 发布类型：**patch**
- 修复 4 个测试文件中的 12 个预存 TypeScript strict-mode 错误；`tsc --noEmit` 通过。

---

## 10.3.2 (2026-03-24)

- 发布类型：**patch**
- 添加 `CLAUDE.md` 项目指引：构建命令、代码风格、测试指南、提交约定、环境设置。
- 新增 Prettier 配置（`.prettierrc`、`.prettierignore`），`format` 和 `format:check` npm 脚本。
- 新增 `.claude/settings.json`：PostToolUse hooks（写入时自动格式化、`.ts/.tsx` 编辑时 typecheck 反馈）。
- 新增 `.claude/skills/verify/SKILL.md` 和 `.claude/skills/dev/SKILL.md`。

---

## 10.3.1 (2026-03-24)

- 发布类型：**patch**
- 在项目根创建 `architecture.md`：18 章架构概览，覆盖 monorepo 拓扑、技术栈、目录结构、数据流管线、38 个后端模块、29 个前端组件、11 个量化引擎等。
- 审计 10 个关键文档并更新 5 个过时文件（`SYSTEM_ARCHITECTURE.md`、`RUNTIME_DATA_LINEAGE.md`、`REPO_RUNBOOK.md`、`TECHNICAL_DUE_DILIGENCE_GUIDE.md`、`MARVIX_SYSTEM_ARCHITECTURE.md`）。

---

## 10.3.0 (2026-03-24)

- 发布类型：**minor**（新功能）
- **Feat：集成 Massive.com REST API 作为美股和加密 OHLCV 新数据源。**
  - 新增 `massive.ts`：`backfillMassiveStocks` / `backfillMassiveCrypto`，含 v2 聚合端点、分页、429 限速处理（15s 退避）、超时重试指数退避。
  - 新增 `massiveIngestion.test.ts`（34 测试）、`massive-smoke-test.ts`（38 真实 API 断言）。
  - 测试套件：102/102 文件通过、591/591 测试通过（之前 101/557）。

---

## 10.2.4 (2026-03-24)

- 发布类型：**patch**
- 新增 82 个高质量测试，覆盖 4 个新测试文件：`timeUtilsEdgeCases.test.ts`（27）、`multiAssetSchemaEdgeCases.test.ts`（27）、`confidenceCalibrationEdgeCases.test.ts`（10）、`manualServiceEdgeCases.test.ts`（19）。
- 修复 `controlPlaneStatus.test.ts` flaky 问题：索引断言改为 `.find()` 查找。
- 测试套件：101/101 文件通过、557/557 测试通过（之前 97/475）。

---

## 10.2.3 (2026-03-24)

- 发布类型：**patch**
- 新增 63 个高质量测试，覆盖 4 个新测试文件：`riskGovernorEdgeCases.test.ts`（27）、`strategyTemplatesEdgeCases.test.ts`（17）、`decisionEngineEdgeCases.test.ts`（16）、`connectAdaptersEdgeCases.test.ts`（15）。
- 测试套件：97/97 文件通过、475/475 测试通过（之前 93/412）。

---

## 10.2.2 (2026-03-24)

- 发布类型：**patch**
- 新增 72 个高质量测试，覆盖 5 个新测试文件：`regimeEngineEdgeCases.test.ts`（9）、`velocityEngineEdgeCases.test.ts`（14）、`performanceEngineEdgeCases.test.ts`（11）、`funnelEngineEdgeCases.test.ts`（19）、`riskGuardrailEdgeCases.test.ts`（19）。
- 修复 P1 flaky `novaLocalStack` 测试：public fallback 跳过 `applyLocalNovaDecisionLanguage`，导致 `summary.nova_local` 未设置。修复方式：发送 `holdings` 并 stub 5 个 cloud API 环境变量。
- 测试套件：93/93 文件通过、412/412 测试通过（之前 88/340）。

---

## 10.2.1 (2026-03-24)

- 发布类型：**patch**
- 新增 131 个高质量测试，覆盖 5 个新测试文件：`riskEngineDeep.test.ts`（17）、`signalEngineScoring.test.ts`（16）、`mathEdgeCases.test.ts`（35）、`tradeIntentEdgeCases.test.ts`（20）、`holdingsSourceDeep.test.ts`（27）。
- **Fix P1**：`math.js` 中 `round(NaN)` 返回 NaN 而非 0，添加 `Number.isFinite()` 守卫。
- **Fix P1**：`riskEngine.js` 中 DERISKED bucket 乘数无效 —— `perSignalCap` 未按 `bucketMultiplier` 缩放，现已修复。
- **Fix P2**：`NOVA_AUTH_DRIVER=postgres` 泄漏进测试环境，添加环境变量 stub 强制使用本地 SQLite。
- 安装缺失的 `pg` 包，解决 14 个测试文件导入失败。
- 测试套件：88/88 文件通过、340/340 测试通过（之前 67/83 有效文件、180/182 测试）。

---

## 10.2.0 (2026-03-24)

- 发布类型：**minor**（新功能）
- **Feat：Postgres 认证存储加固。**
  - 完整 Postgres 认证存储（`auth_users`、`auth_sessions`、`auth_user_roles`、`auth_password_resets`、`auth_user_state_sync`）、session 作用域用户中间件、RBAC 角色系统（ADMIN / OPERATOR / SUPPORT）、密码重置邮件流。
  - `asyncRoute()` 包装所有 async Express 处理器。session 作用域解析：cookie 解析、`RequestWithNovaScope` 中间件、`requireAuthenticatedScope` 守卫。
  - 新增 `migrate-auth-to-postgres.ts` 一键迁移脚本。
- **Feat：Admin 研究运维面板。**
  - `ResearchOpsPage.jsx` + `liveOps.ts`：日工作流运行、数据摄入计数、Alpha 评估分布、训练状态。
- **Feat：持仓导入系统。**
  - 三条数据路径：CSV 上传、截图（vision-model）上传、只读券商/交易所同步。
  - CSV 解析器自动检测分隔符，推断资产类别，标准化权重/市值。
- 新增 6 个测试文件。

---

## 10.1.3 (2026-03-24)

- 发布类型：**patch**
- **全面代码审计与 bug 修复冲刺**（9 个服务端模块，约 14,000 行审查）。
  - Fix P0：POST `/api/decision/today` 非空持仓时不再穿透至 `createApiApp()`。
  - Fix P0：`withTimeout()` 在 chat streaming 中现于 `finally` 清除 setTimeout 句柄。
  - Fix P1：期权到期日从硬编码 `'2026-06-21'` 替换为动态 `computeNearestFridayExpiry()`。
  - Fix P1：`schema.ts` 中 `decision_snapshots` 表创建顺序调整至 `recommendation_reviews` 前。
  - Fix P1：`resolveConflicts()` 现返回新对象（spread）而非变异输入。
  - Fix P2 × 4：NaN 传播守卫、Date 排序 `.getTime()`、JSON parse 守卫、Express 全局错误中间件。
  - Fix P3 × 3：国际化硬编码、chat 历史轮次 8→4、auth seed 守卫。

---

## 10.1.2 (2026-03-24)

- 发布类型：**patch**
- 解决全部 11 个 npm audit 漏洞（4 中危 + 7 高危），通过 npm overrides 修复传递依赖。
- 修复 12 个因环境变量泄露失败的测试（添加 `vi.stubEnv` 隔离 LLM 和远程认证凭据）。
- 修复 manual service 500 崩溃：当用户存在于远程认证但不在本地 SQLite 时优雅处理 FK 约束失败。
- 修复 BrowseTab Earnings 重复 React key 警告。
- 10 个 tab 组件 `React.lazy` code-split，主 JS bundle 从 717 KB 降至 331 KB（-54%）。

---

## 10.1.1 (2026-03-23)

- 发布类型：**patch**
- 标准化文档与 repo 对齐：monorepo 部署布局、本地开发命令、文档交叉链接修正。

---

## 10.1.0 (2026-03-20)

- 发布类型：**minor**（新功能）
- 将执行漂移监控纳入研究和组合治理；添加统一本地开发栈与更丰富的 Browse 详情/信息流界面。

---

## 10.0.2 (2026-03-20)

- 发布类型：**patch**
- 在 Today 和 Proof 中默认显示 evidence mode、执行边界和风险门控。

---

## 10.0.1 (2026-03-19)

- 发布类型：**patch**
- 为策略治理添加机构就绪门控；runtime-state API 测试脱离 sandbox 端口绑定。

---

## 10.0.0 (2026-03-19)

- 发布类型：**major**（重大变更）
- 跨运行时、决策和证明界面分离 live/paper/replay/backtest/demo evidence 模式。
- 添加置信度校准、组合级风控治理器和新闻上下文至决策管线。
- 隔离 demo 模式与生产路径，防止 demo 状态污染真实用户流。

---

## 9.4.1 (2026-03-19)

- 发布类型：**patch**
- 隔离 demo 模式，为 Today/Proof 添加数据来源标签和水印，区分 live/paper/backtest/demo evidence。

---

## 9.4.0 (2026-03-19)

- 发布类型：**minor**（新功能）
- 将 demo 模式隔离至 Menu 小入口，防止 demo 状态同步至真实用户流。

---

## 9.3.0 (2026-03-18)

- 发布类型：**minor**（新功能）
- Browse 体验对齐 Robinhood 发现页：搜索结果打开原生资产详情页，可从搜索添加自选，排名优先匹配公司名和币名。更新应用图标为 NOVA3 素材。

---

## 9.2.1 (2026-03-18)

- 发布类型：**patch**
- 更新 PWA 图标为 NOVA3 素材。

---

## 9.2.0 (2026-03-18)

- 发布类型：**minor**（新功能）
- Browse 增加真实市场搜索（合并外部股票和加密搜索提供商）。认证无法连接远程存储时 fail fast 并显示清晰错误。

---

## 9.1.1 (2026-03-18)

- 发布类型：**patch**
- 认证无法连接远程 session 存储时 fail fast 并显示清晰登录错误。

---

## 9.1.0 (2026-03-18)

- 发布类型：**minor**（新功能）
- 为 Browse 添加真实搜索（live assets + 扩展回退宇宙）。

---

## 9.0.0 (2026-03-18)

- 发布类型：**major**（重大变更）
- 拆分部署认证为轻量 Vercel handlers + 持久化 Redis 兼容存储。本地开发保留 SQLite 认证。

---

## 8.0.2 (2026-03-18)

- 发布类型：**patch**
- 修复认证 session hydration 重置底部 tab 导航的问题。

---

## 8.0.1 (2026-03-18)

- 发布类型：**patch**
- 区分登录失败原因：无效凭据 vs 本地认证服务离线。

---

## 8.0.0 (2026-03-18)

- 发布类型：**major**（重大变更）
- 添加 SQLite 认证、session cookie、密码重置和同步用户状态。

---

## 7.1.0 (2026-03-18)

- 发布类型：**minor**（新功能）
- 添加本地 demo 认证（种子测试账户 + 真实登录/登出流程）。

---

## 7.0.0 (2026-03-18)

- 发布类型：**major**（重大变更）
- 重建引导流为四场景编辑式 intro + 三步简约注册流程。

---

## 6.1.0 (2026-03-18)

- 发布类型：**minor**（新功能）
- Points Hub 升级为完整平台奖励首页（余额 hero、游戏和邀请动作、VIP 兑换、活动记录、规则）。

---

## 6.0.0 (2026-03-18)

- 发布类型：**major**（重大变更）
- 导航重构为 Today、Nova、Browse、My，新增全屏 Menu 和 Points Hub。

---

## 5.1.1 (2026-03-18)

- 发布类型：**patch**
- Holdings demo 曲线在市场数据可用时使用真实历史 K 线。

---

## 5.1.0 (2026-03-18)

- 发布类型：**minor**（新功能）
- 重新设计 Holdings 页面为 Robinhood 式组合概览 + 轻量 NovaQuant 列表。

---

## 5.0.1 (2026-03-18)

- 发布类型：**patch**
- 修复 Today 页面因 undefined conviction 值导致的白屏。

---

## 5.0.0 (2026-03-17)

- 发布类型：**major**（重大变更）
- 围绕一目了然的决策布局重建 Today 首页。

---

## 4.6.0 (2026-03-17)

- 发布类型：**minor**（新功能）
- 重构 Today、Holdings、More 为更轻量的原生风格移动界面；AI tab 保持 ChatGPT + iMessage 对话风格。

---

## 4.5.2 (2026-03-17)

- 发布类型：**patch**
- 精炼 tab bar 为更纤细、更原生的移动导航（更轻的玻璃效果和更微妙的激活态）。

---

## 4.5.1 (2026-03-17)

- 发布类型：**patch**
- 重新设计首页 hero 环形行提升移动端可读性（增强环形对比度，分离 MOVE/SIZE/RISK 标签与状态值）。

---

## 4.5.0 (2026-03-17)

- 发布类型：**minor**（新功能）
- 首页 hero 改为可滑动双页卡片，action card 移至第二页；添加滚动收缩顶栏（crossfade 至 Nova2 logo）。

---

## 4.4.0 (2026-03-17)

- 发布类型：**minor**（新功能）
- 添加滚动收缩顶栏（crossfade Nova2 logo）；首页 hero 紧凑为 rings-first 布局 + 精简辅助卡片。

---

## 4.3.1 (2026-03-17)

- 发布类型：**patch**
- 顶栏 logo 替换为 NOVA1 素材。

---

## 4.3.0 (2026-03-17)

- 发布类型：**minor**（新功能）
- 首页重构为更轻量的 pop editorial 风格（新 hero 卡片、摘要头部、多彩 action tile），保持细顶栏。

---

## 4.2.6 (2026-03-16)

- 发布类型：**patch**
- 进一步压缩顶栏 40px+，降低居中 logo 高度。

---

## 4.2.5 (2026-03-16)

- 发布类型：**patch**
- 缩小顶栏 logo 比例，收紧 header 高度。

---

## 4.2.4 (2026-03-16)

- 发布类型：**patch**
- 放大居中顶栏 logo 为品牌主导展示。

---

## 4.2.3 (2026-03-16)

- 发布类型：**patch**
- 顶栏 logo 替换为 novaquant2 素材。

---

## 4.2.2 (2026-03-16)

- 发布类型：**patch**
- 顶栏文字替换为居中 Nova logo，仅保留 iOS 返回操作。

---

## 4.2.1 (2026-03-16)

- 发布类型：**patch**
- 修复 AI chat composer 漂移至消息流内部（应固定在 tab bar 上方）。

---

## 4.2.0 (2026-03-16)

- 发布类型：**minor**（新功能）
- 重建移动端 AI 页面为 ChatGPT + iMessage 对话布局（sticky composer、suggestion chips、更轻量 assistant 消息结构）。

---

## 4.1.0 (2026-03-16)

- 发布类型：**minor**（新功能）
- 添加本地 Nova 健康检查、MLX-LM LoRA bootstrap 和首波训练任务过滤。

---

## 4.0.1 (2026-03-16)

- 发布类型：**patch**
- 首页从深色 hero 切换回明亮 Apple Fitness 风格调色板（保留新结构和环形，用明亮分层卡片和柔和奶油色背景替代深色）。

---

## 4.0.0 (2026-03-16)

- 发布类型：**major**（重大变更）
- 完全重建首页为 Apple Fitness 式动作界面（深色能量调色板、主 hero 决策卡片、环形状态提示、节奏选择器、简化教练式跟进）。

---

## 3.1.0 (2026-03-16)

- 发布类型：**minor**（新功能）
- 重新设计 AI tab 对齐 ChatGPT 移动端：移除 intro 卡片、空态改为居中 prompt stage、简化顶栏。

---

## 3.0.0 (2026-03-16)

- 发布类型：**major**（重大变更）
- 重建首页为大胆的 Apple Fitness 式动作面板（单一 hero 命令卡片、环形状态提示），移除顶部折叠的额外感知卡片。

---

## 2.5.2 (2026-03-16)

- 发布类型：**patch**
- 移除持久化顶部状态层，围绕更强动作姿态重构 Today（coach-style plan pills、更干净的跟进卡片）。

---

## 2.5.1 (2026-03-16)

- 发布类型：**patch**
- 从日常界面移除始终可见的 mode selector，简化 More 文案，使应用更像有态度的消费产品而非可配置的金融工具。

---

## 2.5.0 (2026-03-16)

- 发布类型：**minor**（新功能）
- 将应用重新定位为消费级决策教练：简化 Today 为强动作优先面板、软化信号卡片、刷新 AI/引导界面。

---

## 2.4.0 (2026-03-16)

- 发布类型：**minor**（新功能）
- 刷新 UI 设计系统（更温暖的高级调色板、更强的组件 token、精致移动导航 chrome、提升卡片样式），灵感来自 Composer 和 Duolingo。

---

## 2.3.0 (2026-03-16)

- 发布类型：**minor**（新功能）
- 统一 iOS 风格导航：移除 More 中重复顶栏、嵌套视图添加原生返回处理、统一 Today 和 Signals 间信号详情返回行为。

---

## 2.2.1 (2026-03-15)

- 发布类型：**patch**
- 移除顶栏中冗余的 Ask Nova 和 About 按钮。

---

## 2.2.0 (2026-03-15)

- 发布类型：**minor**（新功能）
- 重构前端 shell、Today 层次和 More 界面，打造更强的产品级决策体验。

---

## 2.1.1 (2026-03-15)

- 发布类型：**patch**
- 修复 App 渲染顺序 TDZ（暂时性死区）导致的 Today 启动白屏。

---

## 2.1.0 (2026-03-15)

- 发布类型：**minor**（新功能）
- 添加决策智能数据模型脚手架（types、schema、repository）；在 serverless 运行时绕过本地 Ollama 恢复 Vercel 可用性。

---

## 2.0.2 (2026-03-15)

- 发布类型：**patch**
- 在 serverless 运行时绕过本地 Ollama，立即回退至确定性证据驱动响应，恢复 Vercel 可用性。

---

## 2.0.1 (2026-03-14)

- 发布类型：**patch**
- 加固版本管理为单一 `package.json` 驱动的发布流程（生成运行时元数据）。
- 添加 `version:current`、README 同步、changelog 摘要和 About/runtime 版本一致性更新。

---

## 2.0.0 (2026-03-14)

- 发布类型：**major**（重大变更）
- 将 Nova 迁移至 Apple Silicon 单机本地栈（Ollama, `http://127.0.0.1:11434/v1`）。
- 添加统一本地任务路由（`Nova-Core`、`Nova-Scout`、`Nova-Retrieve`），将 Today Risk、每日立场、action card 语言、wrap-up 和助手问答接入本地层。
- 新增 `nova_task_runs` 和 `nova_review_labels` 表，以及 review-label 和 MLX-LM 数据导出路径（本地使用可转化为监督训练数据）。
- 添加本地运行时 API、训练导出脚本、文档和测试时 SQLite worker 隔离。

---

## 1.0.0 (2026-03-15)

- 发布类型：**major**（重大变更）
- 添加专业后端骨干：统一研究、风控治理、决策、组合分配、证据审阅、本地 Nova LLM 运维、工作流、注册表和可观测性。
- 添加规范化后端领域合约和 `/api/backbone/summary` 检视端点。
- 添加本地 Nova 模型路由、prompt/模型注册表、持久化工作流蓝图、审计事件追踪、评分卡和特征平台合约。
- 添加开源借用映射、架构、合规和实现真相文档。

---

## 0.3.0 (2026-03-15)

- 发布类型：**minor**（新功能）
- 添加后端生成的感知层（"系统先判断，用户确认" 模式，基于真实状态而非装饰性 UI 文案）。
- Today 首折升级为决策存在感条带。
- 扩展文案操作系统、参与快照、助手上下文和文档，支持分类级感知差异化。

---

## 0.2.0 (2026-03-15)

- 发布类型：**minor**（新功能）
- 添加统一文案操作系统（共享品牌声音宪法、语调矩阵、护栏和状态到文案选择器）。
- 将共享文案系统接入决策引擎、参与引擎、Today 界面和 Nova Assistant prompt 层。
- 添加工程就绪文案文档和回归测试（语调、无操作完成、通知、widget、助手声音）。
- 引入轻量版本管理系统（单一前后端版本源、build number 支持、About 页面版本展示和可复用 bump 脚本）。

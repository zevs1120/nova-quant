# 变更日志

NovaQuant 所有重要变更记录于此。

## Unreleased

- **Test(ui,membership,app): 补齐主壳与信号链路关键测试（约 +110 用例）。**
  - **Utils：** 新增 `signalHumanLabels` / `signalEntryBounds` 并由 `SignalDetail` 引用；`firstRunRouting` 单测扩充。
  - **Membership：** `applyMembershipAccessToDecision` / runtime 包装、`membership.js` 策略与 Ask Nova 剩余次数（按当日 `membershipUsageDay`）。
  - **App / Menu：** `App.jsx` lazy 目录全量校验、Menu section 路由锚点、首启 `onboarding.css` 入口。
  - **appHelpers：** onboarding 重试 session key、`detectDisplayMode`、`runWhenIdle` 分支。
  - **Docs：** `docs/TESTING.md` 增加上表索引。

- **Test(ui): 新增 Vitest 组件测试与 Playwright 端到端自动化架构。**
  - **组件测试**：引入 `@testing-library/jest-dom/vitest`，为 `KpiCard` 等核心组件补充了包含快照基准比对的 DOM 测试逻辑。
  - **端到端测试**：引入 Playwright 并配合 `playwright.config.js`，自动代理加载本地 Vite 服务器，补充了入口级的冒烟测试（smoke.spec.js），以真实无头浏览器挂载。
  - **UI Debug**：在开发环境下（`npm run dev:web`）非侵入式接入了 `react-scan` 防冗余渲染调优工具。

## 10.21.4 (2026-04-03)

- **Chore(docs,release): 根目录文档与版本对齐，并校正本条目前一组 UI/鉴权变更日志表述。**
  - **Docs：** 更新 `architecture.md`（主壳四 Tab、`React.lazy` 与页级 CSS、`FirstRunSetupFlow` 两步流程、顶栏 WebP）、根目录 `README.md`（壳层与代码分割摘要）、`AGENTS.md` / `CLAUDE.md`（与实现一致的样式与懒加载说明）；本条内 Perf / Shell / Admin 描述已与当前 `App.jsx`、`auth/service.ts` 对齐。
  - **Release：** SemVer `10.21.4`，`APP_BUILD_NUMBER` 递增至 `83`；`README` 版本行与 `src/config/version.js`、`package.json` / `package-lock.json` 同步。

- **Perf(app): 顶栏 logo 换成 WebP，并把多数字页与弹层改成按需加载。**
  - **Logo：** 顶栏两张品牌图切成更轻的 WebP，并且运行时只渲染当前需要的一张，减少进入系统时的图片体积和无效 DOM。
  - **Lazy Load：** `App.jsx` 对绝大多数 Tab（如 `TodayTab`、`AiPage`、`BrowseTab`、`MenuTab` 等）、`FirstRunSetupFlow`、`OnboardingFlow` 以及 `AboutModal`、`MembershipSheet`、`BillingCheckoutSheet` 等使用 `React.lazy`；未进入对应界面或未打开弹层时不进入首包。
  - **Bundle：** 业务页面样式随懒加载 chunk 拆分；全局入口 `src/styles.css` 仅保留首屏必需模块，`today-final.css` / `ai-rebuild.css` / `holdings.css` / `onboarding.css` 等由各自组件显式引入。

- **Refactor(styles): 删除旧 UI 表层并把重做页面的样式改成按页加载。**
  - **Today / Onboarding / Detail：** `Today`、首次引导和信号详情页不再依赖全局入口去预先加载旧样式，改成页面组件自己引入所需 CSS，减少系统刚进入时白白加载的首屏样式。
  - **Cleanup：** 删除已废弃的 `today-redesign.css`、`robinhood-surfaces.css`，并从 `corrections.css`、`polish.css`、`brand-reset.css` 里继续拔掉一大批不再使用的旧 Today 选择器和过时补丁。
  - **Menu / Membership：** `Menu`、会员弹层与结账弹层改为各自携带需要的样式，不再把整套会员相关样式压到全局首屏链路里。

- **Feat(menu,onboarding,today): Menu 清晰化、首次引导压缩为两步，并补上首次使用教学。**
  - **Menu：** 根菜单重排成更清楚的主入口结构，把 `Support`、`Membership & Plans`、`Prediction Games` 提到最上方，下面再分 `Account` 和 `Tools`，减少“所有入口一个重量”的迷失感。
  - **First Run：** 登录后的首次设置从 4 步压成 2 步，先选最想做的事，再一次性定市场、风险和关注标的，让用户更快进入系统。
  - **Today 教学：** 第一次进入 `Today` 时增加轻量使用引导，先提示用户点开卡片，再提示完整卡支持左滑/右滑/上滑以及如何进入详情；完成后会自动记住，不再重复打扰。

- **Feat(ui): Support 页面增加 Prediction Games 快捷入口。**
  - **Menu / Support：** 在 `Support tools` 列表最上面加入 `Prediction Games` 入口，方便直接进入昨日接入的预测游戏页面，不需要再从别的路径绕过去。

- **Feat(app,ui): 全局壳层收口到 edge-to-edge 舞台与滑动 tab bar。**
  - **Shell：** `Today` / `Nova` / `Browse` / `My` 四枚主导航下的主舞台统一成更沉浸的 edge-to-edge 布局，底部栏固定在一致的悬浮高度。
  - **Tab Bar：** 底部导航改成会横向移动的激活滑块，不再只是当前按钮单独变色；激活状态、辉光和位置关系也统一到同一套视觉语言。

- **Feat(nova,ui): Nova 对话页重写并统一 Browse 深色舞台。**
  - **Nova：** 旧聊天页壳层整体移除，改成新的 `nova-ai-*` 结构，上方轻引导、中间留白/消息流、下方 suggestions + 输入 dock 紧贴悬浮 tab bar。
  - **Browse：** 发现页切换到和 Today / Nova 一致的深色舞台，搜索、卡片、详情与新闻块统一成高对比玻璃暗面。
  - **Cleanup：** 删除旧 `ai-chat.css`，并从基础样式里移除一批不再使用的旧 AI 页面壳和补丁。

- **Feat(today,detail): Today 叠卡舞台与信号详情页重做。**
  - **Today / UI：** 首页行动卡改成真正的纵向堆叠舞台，保留大色块卡面、悬浮预览、选卡关闭动效，以及点开后继续左右/上滑的交互。
  - **Detail：** 信号详情页移除顶部可滑动 hero 卡，直接进入信息主体；同时把机器字段翻译成更容易读懂的人话标签，并统一成深色舞台视觉。

- **Feat(today,ui): Today 纵向叠卡重做与展开卡手势恢复。**
  - **Today / Mobile UI：** `Today` 首页行动卡改成参考图那种纵向重叠长方形卡堆，卡片过多时在卡堆内部上下滚动；`Climate` 头部和悬浮底栏继续保留沉浸式黑色舞台。
  - **Card Visuals：** 每张卡改为强对比深色渐变主题，直接为不同卡片注入固定色板和装饰视觉，避免出现发白、文字看不清的问题。
  - **Signal Detail：** 任意卡片点开后会先完整展示该张卡，同时这张展开卡本身继续支持左滑跳过、右滑执行、上滑稍后，不需要退回列表再做动作。

- **Feat(today,auth,billing): Today 移动端沉浸式壳层 + Admin 登录与会话链路加固。**
  - **Today / UI：** `Today` 页移除固定顶部栏，底部 tab bar 收成悬浮式 liquid glass；行动卡改为更强的堆叠舞台、显式 swipe 动效与 validity 倒计时；全局 panel/chip/button 语言往 landing 的细线分割和小圆角统一。
  - **Auth：** 可选 `GUARANTEED_ADMIN_ACCOUNT`（默认 `zevs1120@gmail.com`，可用 `NOVA_DISABLE_GUARANTEED_ADMIN_ACCOUNT=1` 关闭）用于自愈种子；`/api/admin/login` 经 `loginAdminUser`，非 `ADMIN` 角色会在登录后立即撤销会话并返回 `ADMIN_ACCESS_DENIED`。Postgres 路径使用 `pgGetAdminSessionBundle` 单查询拉取 session、用户与角色；`getAdminSession` 带短 TTL 内存缓存并在角色变更时失效。前端对配置邮箱保留 resilient login bridge（Supabase 失败时回退服务端登录）。
  - **Billing / Access：** 数据库角色含 `ADMIN` 的用户在 `getBillingState` 中视为 Pro（`hasAdminPlanOverride`）；Demo 入口仅对 admin 开放，普通账号会自动清理残留的 demo 状态。
  - **Onboarding / Ask Nova：** 首次进入补全 flow 改为 mobile-first；Ask Nova 收回无效占位，把更多高度让给对话内容；Gemini/Nova 的 action card 解释默认用更白话的风格。
  - **Test：** 补充 `useAuth`、membership、Supabase bridge 和 admin postgres hot path 相关测试覆盖。

- **Fix(db,frontend): 迁移安全性与重试回路修复（两项跟进）。**
  - **[Critical] Fix(db): 迁移 SQL 在建唯一索引前先去重并重算运行余额。** `docs/sql/manual_gamification_existing_db.sql` 先用 `DISTINCT ON (user_id, event_type) ... ORDER BY created_at_ms ASC` 保留最早一条、删除其余重复的 `SIGNUP_BONUS` / `ONBOARDING_BONUS` 流水；随后用窗口函数按 `(user_id, created_at_ms, entry_id)` 重新计算整条 `manual_points_ledger.balance_after`，避免旧脏数据删掉后仍把后续余额留在错误状态；最后再执行 `CREATE UNIQUE INDEX`。
  - **[Major] Fix(frontend): Onboarding startup retry 改为按登录会话隔离。** `App.jsx` 的 pending retry 不再用全局布尔 `ref`，而是按 `userId:loggedInAt` 会话 key 记录一次尝试；这样同一挂载周期内切换到另一位用户、或同一用户重新登录，都不会被上一次尝试误挡住，同时继续保持“失败后不紧密循环、下次页面加载或下次登录再试”的行为。

  - **[Critical] Fix(db,server): 注册/Onboarding 赠分幂等改为原子保证。**
    - `manual_points_ledger` 新增条件唯一索引 `idx_manual_points_ledger_singleton`（`WHERE event_type IN ('SIGNUP_BONUS','ONBOARDING_BONUS')`），作为 DB 层最终屏障；并发 INSERT 中后到的事务命中 UNIQUE 冲突，被应用层捕获并等同为"已发放"。
    - `tryGrantManualSignupBonus` 包进 `runManualTransaction`，UNIQUE 冲突被显式吞掉（之前完全在事务外运行）。
    - `claimManualOnboardingBonus` 的 `catch` 块新增 UNIQUE 冲突收口，防止两个并发请求各自通过 `hasLedgerEvent` SELECT 后再双写。
    - Schema patch 函数 + `docs/sql/manual_gamification_existing_db.sql` 同步新增索引语句（幂等）。
  - **[Critical] Fix(frontend): Onboarding Bonus fire-and-forget 改为持久化重试。**
    - `App.jsx` 引入 `nova-quant-pending-onboarding-bonus` localStorage flag（per userId）。
    - `handleCompleteFirstRunSetup` 先写 pending flag 再发起 API 调用并在 `.then()` 成功后清除；网络失败时 flag 持久化。
    - 新增 startup retry `useEffect`（依赖 `manualState`）：每次刷新状态时检查 pending flag，自动重试直到 `ok` 或 `ALREADY_CLAIMED`；用户下次打开 App 也会重试，积分不再漏发。
  - **[Major] Fix(db,server): FREE_DAILY 每日限次改为事务级槽位原子锁。**
    - 新建 `manual_free_daily_entries(user_id, day_key, PRIMARY KEY)` 槽位表，对标 MAIN 场的 `manual_main_prediction_daily` 模式。
    - 新增 `reserveFreeDailySlotOrThrow`：事务内 `SELECT FOR UPDATE` → 存在则抛 `FREE_DAILY_ALREADY_PLAYED`，不存在则 `INSERT`（PK 冲突也被捕获为幂等）。
    - 删除旧的非原子 `COUNT(*)` 跨表聚合查询。
    - Schema patch 函数 + 迁移 SQL 同步。
  - **Test:** `manualGamificationIntegration` 新增三个幂等测试（signup bonus 双调、onboarding bonus 双调各只写一行、FREE_DAILY 同天第二次提交返回 `FREE_DAILY_ALREADY_PLAYED`）；`manualGamificationSchemaPatches` 断言条数更新为 9。

- **Fix(ui,manual): MenuTab 交互层三项 bug 修复。**
  - **Bug 1（中）预测提交成功后 pick 状态残留**：`handleSubmitPrediction` 在成功路径新增 `setPredictionPickById` 删除对应 key，确保提交成功后选项立即清除，防止在后端状态刷新延迟期间出现可重复点击的短暂窗口。
  - **Bug 2（低）反馈文案永久驻留**：`referralMessage`、`predictionMessage`、`shareFeedback` 三类提示文字统一增加 4 秒自动消失（`useEffect` + `useRef` timer，防重复 & 组件卸载自动清除）。
  - **Import**：补充 `useEffect`、`useRef` import。

- **Feat(ui,manual): 主壳打通预测提交、邀请码 claim、首次设置 onboarding 领奖。**
  - **Frontend：** `useEngagement` 经 `fetchApi` 调用 `POST /api/manual/predictions/entry`、`/referrals/claim`、`/bonuses/onboarding`；`MenuTab` 预测游戏与奖励页接线；`App` 在 `FirstRunSetupFlow` 完成后触发 onboarding 领奖（非 Demo 运行时）。
  - **Docs：** `docs/MANUAL_POINTS_AND_PREDICTION.md`、`architecture.md` 补充主壳接线说明。
  - **Test：** `tests/hooks/useEngagement.hook.test.ts` 补充 Demo 模式下邀请码 claim。

- **Fix(manual,db): 并发安全加固与代码审查问题修复。**
  - **Service：** `claimManualOnboardingBonus`、`manualDailyCheckin`、`claimManualReferral` 的去重检查移入 `runManualTransaction` + `FOR UPDATE`，消除 TOCTOU 双授竞态；签到 streak 奖励链式传递 `knownBalance` 防止同毫秒余额错乱。
  - **Schema：** `manualGamificationSchemaPatchStatements` 补全 3 张新表 `CREATE TABLE IF NOT EXISTS`（`manual_checkins`、`manual_main_prediction_daily`、`manual_engagement_daily`）+ 索引，确保存量库升级路径完整；in-memory harness 跳过 patch 中 CREATE TABLE/INDEX（bootstrap 已建表）。
  - **API：** 从 `crossOriginReadPaths` 移除 `/api/manual/state`，消除与 `userScopedPaths` 的语义矛盾。
  - **Dashboard：** `rules` 新增 `standardWinMultiplier: 2`，前端可获取 STANDARD 赔率信息。
  - **Test：** 新增签到幂等、onboarding 幂等、rules 字段测试；重命名 "atomically" 为 "sequentially"；移除 `manualServicePostgresRuntime` 中死代码 mock。
  - **Docs：** 更新 `MANUAL_POINTS_AND_PREDICTION.md` 测试覆盖说明。

- **Chore(db,auth,docs): manual 积分存量库迁移与注册赠分去重。**
  - **Schema：** 导出 `manualGamificationSchemaPatchStatements`，in-memory business / `InMemorySyncDb` 启动后追加 `ALTER … ADD COLUMN IF NOT EXISTS`（`last_checkin_day`、`checkin_streak`、`market_kind`）。
  - **Auth：** `getOrCreateSupabaseBackedUser` 在 Postgres 路径不再让 `pgInsertUserWithState` 与尾部 `tryGrantManualSignupBonus` 重复发放 signup 积分。
  - **Docs / SQL：** 新增 `docs/sql/manual_gamification_existing_db.sql`；`MANUAL_POINTS_AND_PREDICTION.md` 说明生产迁移步骤。
  - **Test：** `tests/manualGamificationSchemaPatches.test.ts`。
  - **Chore：** `.prettierignore` 排除 `docs/sql/*.sql`（Prettier 无 SQL 解析器）。

- **Fix(manual,api,db,docs): manual 积分/预测硬ening — 鉴权绑定、并发幂等、pg-mem 兼容。**
  - **Schema：** 新增 `manual_main_prediction_daily`、`manual_engagement_daily`（已有库需按 `schema.ts` 补表）。
  - **Service：** `MAIN` 日限次在事务内 `SELECT … FOR UPDATE` + 计数，避免 pg-mem 对条件 `ON CONFLICT` 的偏差与超发；engagement 改为事务内去重 + 固定 ledger `ENGAGEMENT_SIGNAL`；推荐阶段二在事务内对邀请人 `user_state` 加锁、`UPDATE … RETURNING` 防止重复发奖；onboarding 响应 `referralStage2` 带 `skipped` 原因；Dashboard VIP 文案使用 `VIP_REDEEM_POINTS`；签到去掉与 `manual_checkins` 重复的同日分支。
  - **API：** `POST /api/manual/*` 使用 `requireAuthenticatedScope`，不再接受 body `userId`；`GET /api/manual/state` 使用会话 scope；`app.ts` 为 `/api/manual/state` 设置 `Cache-Control: private, no-store`。
  - **Frontend：** `useEngagement` 拉取 `/api/manual/state` 不再附加 `userId` query；VIP 兑换请求体仅传 `days`，与会话绑定一致。
  - **Test：** 扩充 `manualGamificationIntegration`；新增 `manualApiRoutes`。
  - **Docs：** 更新 `docs/MANUAL_POINTS_AND_PREDICTION.md`。

- **Feat(manual,auth,admin,docs): 积分体系与 Prediction Game 后端首版。**
  - **Schema：** `manual_user_state` 增加签到字段；`manual_referrals` 支持 `PARTIAL`/`COMPLETED`（保留 `REWARDED`）；`manual_prediction_markets.market_kind`；新增 `manual_checkins`。
  - **规则：** 注册/onboarding 赠分、邀请两阶段、VIP 月兑上限、签到与 streak 奖励、MAIN/FREE_DAILY/STANDARD 预测与每日限次、结算入账；冷启动返还可通过 `NOVA_MANUAL_PREDICTION_COLDSTART*` 配置。
  - **API：** `/api/manual/bonuses/onboarding`、`checkin`、`engagement/signal`、`referrals/complete-stage2`；管理端 `POST /api/admin/manual/predictions/settle`。
  - **Auth：** `pgInsertUserWithState({ grantManualSignupBonus })`；真实注册路径发放 signup 积分（种子用户关闭）。
  - **Docs：** 新增 `docs/MANUAL_POINTS_AND_PREDICTION.md`；更新 `architecture.md`、`CLAUDE.md`、`AGENTS.md`、`CURRENT_PRODUCT_DOCUMENT_ZH.md`、`.env.example`。
  - **Test：** `tests/manualGamificationIntegration.test.ts`；更新 manual 相关单测。

- **Fix(test,ci): `tests/factorMeasurements.test.ts` 为动量/carry 实测报告用例设置 20s Vitest 超时，避免 GitHub Actions 默认 5s 在慢 runner 上超时失败。**

- **Test(hooks,admin,utils): 全量补齐 Browse/信号详情/日期、Hooks、Admin 组件与 HTTP 下载测试；修复 Nova Assistant 线程加载。**
  - **Fix(app,chat):** `useNovaAssistant` 将错误的 `fetchJson` 调用改为 `fetchApiJson`，避免运行时 `ReferenceError`。
  - **Test:** 新增 `tests/browseWarmup.test.ts`、`tests/signalDetailsDeep.test.ts`、`tests/disciplineDate.test.ts`、`tests/httpDownloadToFile.test.ts`；`tests/hooks/*` 覆盖 `useAuth`、`useAppData`、`useBilling`、`useMembership`、`useEngagement`、`useInvestorDemo`、`useNavigation`、`useLocalStorage`、`useControlPlaneStatus`、`useDemoAssistant`、`useNovaAssistant`；`tests/admin/*` 覆盖 `StatCard`、`Topbar`、`Sidebar`、`AdminLogin`。
  - **Chore(test):** `vite.config.js` 在 Vitest 下启用 React 插件以编译 JSX；`tests/vitest.setup.ts` 对残缺 `localStorage` 注入 happy-dom；新增 devDependencies `happy-dom`、`@testing-library/react`。

- **Test(perf,frontend,api): Vitest 并行恢复、dotenv 静默与 API/工具链鲁棒性测试。**
  - `vite.config.js`：去掉强制单 worker + 关闭 `fileParallelism` 的配置（全量测试墙钟时间从约 50s+ 降至约 10s 量级，视机器而定）；`test.env.DOTENV_CONFIG_QUIET` 减少测试进程中重复的 dotenv 提示。
  - `src/utils/api.js`：在 **localhost** 下对 `/api/*` 的 404/405/HTML 回退不再因「已缓存非空 base」而失效；当所有候选 base 仅返回可旋转类响应时返回最后一次响应，避免误将失败 base 写入缓存。
  - 测试：`tests/apiFallback.test.ts` 扩充（405、HTML、`fetchApiJson` 错误体、缓存绝对 dev base 后再次 404 的轮转）；新增 `tests/appHelpers.test.ts`、`tests/formatUtils.test.ts`、`tests/fetchWithRetry.test.ts`（`src/server/utils/http.ts` 重试语义）。
  - 文档：新增 `docs/TESTING.md`；更新 `CLAUDE.md`、`AGENTS.md` 测试说明。

- **Fix(billing): Stripe 支付链路官方最佳实践加固 — 4 项合规项全部落地。**
  - **[强烈推荐] Feat(billing): 新增 `invoice.paid` webhook handler，确保订阅续费窗口实时刷新。**
    - 以往续费成功后仅依赖 `customer.subscription.updated` 隐式更新，但 Stripe 官方文档强制要求监听 `invoice.paid` 来刷新 `current_period_end`（"Your site receives an invoice.paid event... updates the customer's access expiration date"）。新 handler 在每次 Stripe 扣款成功后重刷 `current_period_start_ms`/`current_period_end_ms` 并重断言 `status = ACTIVE`，同时防御性跳过 `CANCELLED`/`EXPIRED` 订阅，避免误复活已取消账号。
  - **[强烈推荐] Feat(billing): 新增 `invoice.payment_failed` webhook handler，扣款失败时立即降级权限。**
    - 以往续费失败后平台无感知，用户仍可访问付费功能直到 `customer.subscription.updated` 到达。新 handler 在 `invoice.payment_failed` 触发时立即将 ACTIVE 订阅降级为 `PENDING`，与随后到来的 `customer.subscription.updated`（`past_due → PENDING`）幂等合并，无重复处理风险。
  - **[推荐] Feat(billing): 新增 `checkout.session.async_payment_succeeded` / `async_payment_failed` 事件处理，支持 ACH/SEPA 等异步支付方式。**
    - Stripe 官方文档明确："Delayed payment methods generate a `checkout.session.async_payment_succeeded` event when payment succeeds later." 以往仅处理同步的 `checkout.session.completed`，若未来开启 ACH/BACS/SEPA 等异步支付方式将在未实际收款时误激活订阅。`async_payment_succeeded` 现路由至统一的 `handleStripeCheckoutLifecycleEvent(object, 'COMPLETED')`，`async_payment_failed` 路由至 `'ABANDONED'`。
  - **[推荐] Feat(billing): Stripe Checkout Session 创建请求新增 `Idempotency-Key` header。**
    - `stripeRequest<T>` 新增可选 `idempotencyKey` 参数；`createStripeCheckoutSession` 自动以本地 `localSessionId` 作为 key，确保网络超时重试时 Stripe 返回同一个 Checkout Session 而不是创建重复订单（Stripe 官方幂等性最佳实践）。
  - **Test: 新增 `tests/billingInvoiceWebhooks.test.ts`（6 个测试）：** `invoice.paid` 刷新续费周期和重断言 ACTIVE、`invoice.paid` 不复活 CANCELLED 订阅、`invoice.payment_failed` 将 ACTIVE 降级为 PENDING、`async_payment_succeeded` 标记 COMPLETED、`async_payment_failed` 标记 ABANDONED、`Idempotency-Key` header 值与 localSessionId 一致。

- **Feat(admin,research): Admin 管理界面接入 Qlib Bridge 健康状态与因子/模型面板。**
  - **后端 (`service.ts`)**：新增统一的 Qlib Bridge 状态汇总，完整 system snapshot 会先读取 `/api/status` 生成 `disabled / offline / data_not_ready / online` 四态，再仅在 Bridge 进程在线时补拉 `/api/factors/sets` 与 `/api/models`。headline 快路径改为只请求轻量 `/api/status`，并使用更短 timeout 与短 TTL 缓存，避免首屏被重型端点拖慢。
  - **前端 SystemHealthPage**：新增 Qlib Bridge 健康面板（Disabled / Online / Data Not Ready / Offline 四态 pill、version/uptime/region/provider、最大标的容量）和因子引擎/模型面板（Alpha158/360 因子集列表、预训练模型列表及大小）。告警列表改为只消费后端 diagnostics，不再重复拼装 Qlib 告警。
  - **前端 OverviewPage**：AI/因子卡片、系统层摘要与 priority items 全部切换为消费统一的 `qlib_bridge_state`，`data_not_ready` 会单独显示为“数据未就绪”，不再误报为“在线”。
  - **Overview headline_metrics 与 system_cards**：新增 `qlib_bridge_ready`、`qlib_bridge_state` 字段，并保留 `qlib_bridge_enabled`、`qlib_bridge_healthy`、`qlib_bridge_version`，使渐进式加载和完整快照使用同一套状态契约。
  - **Diagnostics**：后端根据 Bridge 状态自动产出 3 类诊断项——已启用但不可达 (WARN)、在线但数据未就绪 (WARN)、因子引擎在线 (INFO)。
  - **Test: 新增 `adminQlibBridge.test.ts`**，覆盖 disabled 路径（无 Qlib 诊断）、enabled-but-unreachable（WARN 诊断）、running-but-not-ready（`data_not_ready` 分支）、headline 快路径字段与“仅访问 `/api/status`”约束，以及 graceful degradation（无异常抛出）。
- **Fix(auth): 认证系统安全加固 — 8 项审计问题全部处理。**
  - **[高危] Fix(auth): 登录端点新增 IP 级别 rate limiting（默认 60s/10 次）。** 防止暴力破解攻击，`/api/auth/login` 和 `/api/admin/login` 均受保护，超限返回 429。
  - **[高危] Perf(auth): Supabase access token 验证新增内存缓存（默认 TTL 30s）。** 避免每次 API 请求都对 Supabase 做网络调用，减少延迟和 Supabase 不可达时的全站影响。
  - **[中危] Fix(auth): 修复 Postgres 注册 TOCTOU 竞态。** `signupAuthUser` 的 `pgInsertUserWithState` 在 unique constraint 错误时返回 `EMAIL_EXISTS`，而非抛出 raw Postgres 错误。
  - **[中危] Fix(auth): Admin session cache 默认 TTL 从 30s 降至 10s。** 多实例部署下角色变更传播更快。
  - **[中危] Feat(auth): 新增 AuthContext。** `useAuthContext()` 可在深层组件中直接获取认证状态，消除 prop drilling。
  - **[低危] Fix(auth): 测试账号改为 opt-in。** `NOVA_DISABLE_TEST_ACCOUNT` 废弃，新增 `NOVA_ENABLE_TEST_ACCOUNT=1` 显式启用；默认不再创建 test/test 账号。
  - **[低危] Fix(auth): 密码重置 code hint 改为显式 opt-in。** `shouldExposePasswordResetCodeHint` 仅在 `NOVA_EXPOSE_RESET_CODE_HINT=1` 时返回 true，防止 staging 泄露。
  - **[信息] Fix(auth): 未认证时不再渲染主应用内容。** 使用 early return 模式，未登录用户只看到 OnboardingFlow，不再只是视觉层遮挡。
  - **Test: 新增 `authRateLimitAndHardening.test.ts`，覆盖 rate limiting、token cache、signup 竞态、test account 默认、reset code hint。**

- **Fix(auth,signal,hub,db): 认证系统全面审计修复 — 5 项 Issues 全部清除。**
  - **[🔴 高危] Fix(cors): CORS preflight 未允许 `Authorization` header，跨域 Bearer token 请求可能被浏览器拦截。**
    - `app.ts` 和 `api/index.ts` 两处 `Access-Control-Allow-Headers` 均从 `Content-Type` 更新为 `Content-Type, Authorization`，覆盖 first-party、cross-origin-read 和 Vercel public CORS 三条路径。
  - **[🟡 中危] Fix(auth): 注册流程 `signOut()` 触发 `onAuthStateChange` 的 `SIGNED_OUT` 事件导致 UI 状态闪烁。**
    - `useAuth.js` 新增 `signupInProgressRef` 门控——注册期间 `SIGNED_OUT` listener 被忽略，注册完成（包括异常路径）后通过 `finally` 解锁。
  - **[🟢 低危] Refactor(utils): 抽取 `api.js` 和 `supabaseAuth.js` 重复的运行时 API 基地址发现逻辑到共享 `apiBase.js`。**
    - 新增 `src/utils/apiBase.js`（`runtimeApiBases`、`buildApiUrl`、`trimTrailingSlash`、`unique`、`isLocalHost`）；两个消费者文件各减少约 60 行重复代码。
  - **[🟢 低危] Perf(auth): Supabase 浏览器运行时配置新增 `sessionStorage` 缓存，避免每次页面加载重复执行瀑布式 API 发现。**
    - `loadSupabaseBrowserConfig` 在 `VITE_SUPABASE_URL` 未配置时，先检查 `sessionStorage` 缓存再发起网络请求；成功获取后写入缓存。
  - **Test: 新增 `authHardeningFixes.test.ts`，覆盖 CORS Authorization 验证、共享工具函数正确性、API 废弃端点 410 返回。**

- **Fix(deploy,research): 修复 Qlib Sidecar 的 EC2 部署问题。**
  - 以 `ubuntu` 用户身份运行 `nova-qlib-bridge.service`，在 GitHub Actions 部署时从仓库同步 systemd 单元文件，并修正不健康服务检查逻辑——不再在 `systemctl is-active` 提前退出，而是打印 journal 日志。

- **Fix(test,ci): 缩减因子诊断测试中的合成K线历史数据。**
  - 缩减用于因子诊断测试的合成K线历史数据，使动量/carry 覆盖仍能执行对齐的 OHLCV、funding 和 basis 逻辑，同时避免触及 GitHub Actions 的 5 秒超时边界。

- **Fix(auth,deploy): 恢复旧版 Supabase 账户的生产环境登录。**
  - 重启服务端 `/api/auth/login` 路径，修复请求 scope/session 水化逻辑以支持第一方 `novaquant_session` cookie；添加前端降级路径——当 Supabase 密码登录失败时回退到服务端登录桥接；将 `app.novaquant.cloud` `/api/*` 流量重新指向新的 `nova-quant-api.vercel.app` Vercel 后端，使 `zevs1120@gmail.com` 可以使用 `Zevs1120` 登录。

- **Fix(db,auth,deploy): 修复生产环境 Supabase Signup 配置。**
  - 在 EC2/Vultr 模板中要求提供 API 宿主 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY` 和 redirect 环境变量；在独立的 `app/` Vite 配置中添加构建时公开 Supabase 注入，使已部署的 H5 应用不再依赖缺失的后端环境变量来发现浏览器认证设置。

- **Fix(auth): 在注册界面诚实展示 Supabase 邮件发送频率限制。**
  - 在注册体验中诚实展示 Supabase `over_email_send_rate_limit` 错误，而不是将其泛化为"注册不可用"错误。

- **Fix(db,test,docs): 仓库完全收口到 Supabase/Postgres，清除本地数据库残留。**
  - 移除历史本地数据库与旧 HTTP 测试依赖，删除本地库初始化/迁移脚本，并将底层 SQL helper 收口到 `postgresSql.ts`。
  - API 测试改为进程内 HTTP harness，不再依赖端口监听；全量 `875` 个 Vitest 用例在受限环境下可稳定通过。
  - README、runbook、架构文档、历史说明与自动生成策略报告统一改写为 Supabase/Postgres 语义，去除本地数据库路径和旧迁移入口。

- **Fix(auth,db,deploy): 注册验证链路收口到 Supabase，线上数据源统一为 Supabase/Postgres。**
  - 前端注册/重发验证不再依赖“本地是否已经拿到 Supabase 配置”的瞬时状态，而是始终先拉取运行时配置再执行；修复页面刚打开时误报 “Supabase Auth 还没有配置完成” 的问题。
  - 浏览器端废弃本地持久化的 `nova-quant-auth-session` 假登录态，只认 Supabase 会话与服务端 Bearer token 校验；注册开始前会主动清空主 client 会话，避免旧账号残留把新注册流程伪装成“直接进系统”。
  - Qlib sidecar 数据同步改为直接读取 Supabase/Postgres，不再依赖本地 `legacy local runtime store`；相关 `.env.example`、EC2/Vultr 部署模板、README 与运行文档统一改为线上数据库配置。
  - `/api` 读路径与文案同步去除 `mixed-postgres-fallback` / “falling back to legacy local runtime” 表述，统一说明当前链路是 Postgres primary / bridge path。

- **Feat(deploy): GitHub Actions 部署流程纳入 nova-qlib-bridge.service。**
  - deploy-ec2.yml 重启阶段新增 qlib-bridge，按 systemd 依赖链顺序（marvix -> marvix-backend -> nova-qlib-bridge）。
  - 健康检查和失败日志输出同步覆盖 qlib-bridge 服务。
  - EC2 skill 全部命令模板同步更新为四服务。

- **Fix(research): data_sync.py 修复 symbol 映射和数据清理。**
  - JOIN `assets` 表将 `asset_id` 映射为真实 ticker symbol（之前用数字 ID 导致因子查询失败）。
  - Sync 前清理旧的 CSV staging 和 Qlib binary 数据，防止新旧数据混合。
  - 仅同步 `1d` 日线数据（Qlib 因子计算基于日线，跳过 1h/5m 减少 90% 数据量）。

- **Fix(deploy): nova-qlib-bridge.service uv 路径修正。**
  - ExecStart 从 `/root/.local/bin/uv` 改为 `/home/ubuntu/.local/bin/uv`，匹配 EC2 实际安装位置。

- **Fix(auth): 注册流程改为隔离的 Supabase 邮箱验证链路。**
  - 前端注册不再复用主浏览器 auth client，改为使用不持久化、独立 storage key 的 Supabase client 发起 `signUp` / `resend`，避免注册时把未验证用户直接写进主登录态。
  - Onboarding 新增明确的 `verify email` 等待页与 resend 按钮；如果 Supabase 误配置成注册即返回 session，前端会直接报配置错误而不是偷偷进入系统。
  - 认证 hook 和 App 壳层同步更新，注册成功后只停留在待验证态，直到用户完成邮箱验证后再走正常登录。

- **Fix(test,auth,db): 统一全量验证到新的 Supabase-only 鉴权与可重复测试运行时。**
  - 将已废弃的 `/api/auth/signup`、`/api/auth/forgot-password` 旧假设从测试中移除，改为断言 `AUTH_MANAGED_BY_SUPABASE`；admin 场景改为直接 seed auth service 用户，而不是依赖已关闭的公共注册 API。
  - 新增可直接单测的 request scope resolver，并将 user-scope 相关测试改为验证 Bearer token 绑定、guest 限制和 `AUTH_REQUIRED / USER_SCOPE_MISMATCH` 返回，不再依赖旧 cookie 注册流。
  - Vitest 运行时默认固定到隔离 legacy local runtime，并禁用 Postgres mirror 写入；只有显式声明的 Postgres/runtime 测试才会重新打开对应路径，保证 `npm run verify` 在本地可重复且不依赖真实 Supabase 网络。
  - 对齐新的 runtime bundle / mirror 读写路径，修复 Postgres fallback 与 mirror consistency 测试中过时的断言和数据桩。

## 10.21.3 (2026-04-02)

- 发布类型：**patch**（首次设置 / 信号有效期 / 鉴权会话与演示收口 + 文档同步）

- **Feat(app,ui,signal,auth): 首次设置、信号有效期 UI、鉴权角色载荷与演示模式收口。**
  - **Feat(app,auth,ai,ui):** 登录且非 onboarding / 非演示 / 非找回密码时展示 `FirstRunSetupFlow`（目标、风险画像、市场焦点、自选最多 5 只）；按 `userId` 将完成或跳过写入 `localStorage`（`nova-quant-first-run-setup-by-user`），完成后按目标跳转 Today / Browse / My。`AiPage` 重组滚动结构：关联上下文、用量条与空态/线程同轨；快捷建议 chip 仅在无消息线程时显示。`src/server/chat/prompts.ts` 增加行动卡「翻译摘要」装配（`formatActionCardTranslationBrief` 等），便于 Nova 解释当前焦点信号；`tests/chatPrompt.test.ts` 覆盖。
  - **Feat(ui,signal):** `TodayTab` 行动卡增加有效期解析（`valid_until_at` / `expires_at`、horizon 文本或天数回推）、美东与 UTC 展示、倒计时 pill（每秒刷新、30 分钟内警告、过期态）与中英失效说明（止损 + 「未在截止前触发」等）；`today-final.css` / `corrections.css` 强化滑动动效。
  - **Fix(auth,ui,onboarding):** `handleAuthSession` / `handleGetAuthProfile` 返回 `roles` 与 `isAdmin`（`getEffectiveAuthRolesForUser` + DB 角色行 + `NOVA_ADMIN_EMAILS` / `NOVA_OWNER_EMAIL` 等）；前端 `useAuth` 将会话角色规范化并设置 `isAdmin`。投资者演示：仅当构建时 `VITE_ENABLE_DEMO_ENTRY !== '0'` **且** 当前用户为 ADMIN 时可开启；`useInvestorDemo` 在失权时自动关闭演示并清理备份。本地 `fetchApi`：在 localhost 上对 `/api/*` 若收到 404/405 或 HTML 响应则轮换候选 API base（含 `https://api.novaquant.cloud`）。首次设置流换步滚动回顶、footer 与全屏层滚动/安全区样式优化。
  - **Test:** `tests/authLoginApi.test.ts` 断言 `roles` / `isAdmin` 及 `NOVA_ADMIN_EMAILS` 场景；`tests/apiFallback.test.ts` 等覆盖本地 base 轮换。

- **Docs:** 更新根目录 `architecture.md`、`CLAUDE.md`、`AGENTS.md`（五段部署、模块规模、会话/演示/API 发现说明）；`CHANGELOG` 与本版本号、`README` 版本行由 `version-manager` 同步。

## 10.21.2 (2026-04-01)

- 发布类型：**patch**（Qlib Bridge 接口契约全面对齐）

- **Fix(research): predictQlibModel TS 契约与 Python sidecar 完全对齐。**
  - `QlibModelRequest` 从 `start_date/end_date` 改为 `predict_date/lookback_days/factor_set`，与 Python `ModelPredictRequest` 一致。
  - `QlibModelResult` 从嵌套 map 改为 `QlibPredictionRow[]`（`symbol/score/rank`），与 Python `ModelPredictResult` 一致。

- **Fix(research): 因子请求字段从 factors[] 对齐为 factor_set 字符串。**
  - `QlibFactorRequest.factors: string[]` 改为 `factor_set?: string`，与 Python `FactorRequest.factor_set` 一致。
  - `featureSignalLayer.js` 调用点从 `factors: ['Alpha158']` 改为 `factor_set: 'Alpha158'`。

- **Fix(research): 数据同步二进制转换失败时返回 status="partial" 而非 "ok"。**
  - 防止 `server.py` 在同步不完整时错误地重新初始化 Qlib，避免"看似成功但因子不可用"的误判。

- **Fix(nova): checkQlibHealth 同时验证 qlib_ready 标志。**
  - 仅进程存活不再视为健康，必须 Qlib 数据已初始化才返回 true。

- **Test(bridge): 补充 sidecar 契约测试。**
  - 新增 `test_compute_factors_rejects_invalid_request`、`test_predict_rejects_invalid_request`、`test_predict_contract` 三个测试，验证请求 schema 422 拒绝和响应结构。
  - 收紧 `test_compute_factors_requires_qlib` 在 200 响应时的字段断言。

## 10.21.1 (2026-04-01)

- 发布类型：**patch**（审查后二次修复）

- **Fix(quant): QlibFactorResult 类型与 Python 返回格式对齐。**
  - 接口从 `data` 嵌套字典重构为 `rows: QlibFactorResultRow[]`，与 Python FactorComputeResult 完全匹配，修复 Qlib 增强永远静默跳过的问题。

- **Fix(config): getConfig() fallback 分支 qlibBridge.enabled 默认值统一为 false。**

- **Fix(quant): queries.ts 增加 qlibBridge.enabled 前置检查避免禁用时异常开销。**

- **Fix(security): RestrictedUnpickler 白名单补充 qlib/pandas。**

- **Fix(security): data_sync.py 列名标识符增加正则校验。**

- **Chore: 清理 syncQlibData 中未使用的 timeoutMs 变量。**

## 10.21.0 (2026-03-31)

- 发布类型：**minor**（架构完善与端到端集成）

- **Feat(research,quant): 深度整合 Qlib Bridge 客户端与自动化数据同步管道。**
  - **核心客户端引擎 (`qlibClient.ts`)**：构建了完全类型安全的高性能 HTTP API 透传层，匹配 Python 端 `/api/data/sync`、`/api/factors/compute` 等服务；添加自动回退容错并区分长短任务超时（最长容忍高达 300s）。
  - **自动化影子同步**：在 Node.js 端行情的全量抓取管道 (`scripts/backfill.ts`) 完成后自动触发非阻塞挂起的同步指令，无需外部干预即可使得 Python 端 legacy local runtime -> Bin 数据矩阵保持时效最高同步。
  - **非阻塞信号增强 (`featureSignalLayer.js`)**：使用修饰器模式为原始量化引擎注入 Alpha158 外部算力补全；一旦桥接侧（Sidecar）出现崩溃、挂起或 OOM，TS 系统自动降级回归到纯本地指标进行信号计算，保证整体交易系统的永不掉线（Graceful Degradation）。

- **Feat(ai,strategy): 原生引入 Qlib 因子的认知对齐与算法级算力挂钩。**
  - **LLM 认知对齐 (`service.ts`)**：将 `qlib_alpha158_snapshot` 有条件地映射进入 Marvix AI 的上下文环境（`buildActionCardNarrativePrompts`），并重写了底层预设的 System Prompt，要求模型在数据存在时“抽取诸如量价/动量等定量因子来丰富它的 `brief_why_now`（逻辑理由）”。
  - **决策算力挂钩 (`engine.ts`)**：无需等待独立的 ML 模型建立，在基础量化推荐引擎（`rankCard`）中直接加入了针对 Qlib Alpha 因子的 `qlibFeatureBoost` 加成算子：当检测到有效的 Alpha 截面数据时基础分权重增加 4 点；若其中动量截面因子（`ROCP5`）与交易挂单方向同向，则赋予额外 3 点的共振增益提升排名。

- **Fix(quant,hub,db): 修复 Qlib Bridge 架构端到端融合的严重断层安全风险与稳定性问题。**
  - **接口形态适配 (`featureSignalLayer.js`)**：修正由桥接层嵌套格式不匹配导致的取值错误，重写内部符号分组聚合逻辑，清理阻断日志的隐式 catch 静默失败问题，废弃所有 `console.warn` 以遵循项目日志监控规范。
  - **端到端注入补全 (`queries.ts`)**：修复 `decision engine` 信号对象在流转中脱离 Alpha 增强处理的生命周期缺陷；改造了 `buildDecisionSnapshotFromCorePrimary` 查询核心切面，在此直接完成特征清洗赋予，保障 `rankCard` 阶段的因子加速得以真正运行及反馈至 LLM。
  - **环境默认降级 (`config.ts`)**：修改 Qlib Bridge 开关默认为 `false` 避免无侧车的纯 Vercel 生产环境对 `/api/data/sync` 发起无效长轮询。
  - **侧车安全硬化 (`model_adapter.py`, `data_sync.py`)**：为 Python 端的静态模型加载重写了 `RestrictedUnpickler` 细粒度过滤加载类，阻止高危库及未知组件的载入；为 legacy local runtime ETL 同步脚本针对表名的 `f-string` 拼接增加了高强度的纯数字字母下划线强制正则断言，彻底封堵 SQL 注入风险。

## 10.20.0 (2026-03-31)

- 发布类型：**minor**（架构重构与特性发布）

- **Feat(research,quant): 初始化 qlib-bridge Python sidecar 服务，引入 Microsoft Qlib 量化引擎。**
  - 为克服 TypeScript/Node.js 生态在量化因子计算和传统 ML 推理上的算力及生态局限，搭建了无侵入式的独立 Python 微服务 `qlib-bridge`。
  - 新增基于 FastAPI 和 PyQlib 的 REST API 桥接层：提供 Alpha158/Alpha360 因子日频计算接口（`/api/factors/compute`），以及预训练决策树/传统机器模型的远程推理端点（`/api/models/predict`）。
  - 新增 `data_sync.py` 执行同步：自动化桥接 Nova Quant 存量的 legacy local runtime OHLCV K线数据到 Qlib 原生二进制格式 (dump_bin)，避免双重抓取。
  - 工程化限制与环境适配：基于 2GB 发行版限制设计内存安全机制 (`max_universe_size: 50`) 和 systemd 内存熔断；开发工作流彻底摒弃传统 venv 切换到更现代极速的 `uv` 虚拟环境。
  - 架构文档同步更新，明确了四端（app, admin, web, serverless）外挂一个模型端的部署拓扑。

- **Docs(architecture)：全栈架构与部署环境全局文档治理与同步。**
  - **核心架构升级同步**：在 `README.md` 与 `docs/SYSTEM_ARCHITECTURE.md`、`architecture.md` 等架构文档中，全面记录了原生 Supabase Auth 的结构变迁（替换了原有的本地验证代理和 Upstash Redis 等冗余依赖）。
  - **计费与会员模块文档补齐**：在图表及文档中加入了专门负责全局数据同步的 `useBilling.js` Hook 的记述，以及关于 Membership & Billing 订阅层级与限额网关的详细说明。
  - **环境配模板清理**：清除了 `deployment/` 目录下（aws-ec2, vultr 等）`.env.example` 关于 `RESEND_API_KEY` 等依赖邮件发送参数，指导开发者直接使用 Supabase 原生 SMTP。

- **Feat(auth): 彻底弃用 Resend 依赖，全面接入原生 Supabase Auth 邮件流。**
  - 废除冗余架构：重构 `service.ts`，废除自定义 6 位验证码存取、弃用定制化的邮件模板管理流程，改为原生调用 SDK 的 `signUp()` 和 `resetPasswordForEmail()`，将整个账户边缘发送链路收敛并下放到原生 Supabase 后台接管。
  - 移除环境凭证：清空本地环境、生产环境模版及 4 个测试框架桩文件中的 `RESEND_API_KEY`、`NOVA_AUTH_EMAIL_FROM` 等遗留环境变量引用。
  - legacy local runtime 双引擎热回退：解决 Supabase 服务不存时的断网阻断痛点，新增纯本地回退日志 (`console.warn` 打印 Mock Tokens)，保障本地无三方密钥情况下的离线开发闭环顺畅。
  - 清理与基建瘦身：清除 `npm` 相关的底层脆弱漏洞 (Audit Fix)，删除 `scripts/check-resend-config.ts` 以及文档内全部 `resetEmail.ts` 旧架构索引。
  - 确保了 880 个测试与 `npm run verify` 全部通过，完全去除了底层的 Resend `fetch` mocks。

- **Fix(billing,auth,cache,ui): code-review 发现的 8 项 Bug 全修复（安全 · 正确性 · 一致性）。**
  - **[🔴 高危] Fix(billing): Stripe Webhook 签名验证在 Vercel Serverless 上必定失败。**
    - 根因：`/api/billing/webhook` 路由依赖全局 JSON 中间件设置的 `req.rawBody`，但 Vercel 会在到达路由前预解析请求体，导致 `rawBody` 为空字符串，HMAC 验签必定失败，所有 `checkout.session.completed` / `customer.subscription.*` Webhook 返回 400，用户付款后会员权益永远无法自动激活。
    - 修复：`/api/billing/webhook` 路由前挂载专属 `express.raw({ type: 'application/json', limit: '2mb' })` 中间件。该中间件将原始字节写入 `req.body`（Buffer），与平台层 JSON 预解析完全隔离；向后兼容已有 `req.rawBody` 环境。
  - **[🔴 高危] Fix(billing): `normalizeStripeInterval` fallback 不安全，且月付/年付 Pro 订阅被错误识别为 Lite。**
    - 根因①：Stripe API 实际返回 `interval: 'week'`（非 `'weekly'`），原来没有 `'week'` 的映射分支，所有周期都命中最后的 `return 'weekly'` fallback，偶然正确但原因错误；未知 interval（如 `'day'`、空字符串）也错误 fallback 到 `'weekly'`。
    - 根因②：plan key 推断逻辑以 `amountCents >= getMembershipPriceCents('pro', 'weekly')（2900）` 为门槛，但月付 Pro 可低于此值（如 $9.90），导致付了 Pro 价格的用户仅获得 Lite 权限。
    - 修复①：显式映射 `'week' → 'weekly'`，未知 interval fallback 改为 `'monthly'`（更安全，不会误授权 Pro）。
    - 修复②：plan key 推断优先使用 Stripe metadata 中的 `plan_key`（由 checkout 创建时写入），其次使用本地已有订阅记录，完全移除基于金额的模糊推断。
  - **[🟡 中危] Fix(cache): 写操作未触发前端读缓存失效，用户修改设置后有 20s 陈旧数据窗口。**
    - 根因：`setRiskProfile`、`setNotificationPreferencesState` 等写路径完成 DB upsert 后，不清除该用户的 `frontendReadCache` 条目，导致下次读取仍返回过期数据直到 TTL 超时。
    - 修复：新增 `invalidateFrontendReadCacheForUser(userId)` 辅助函数，遍历 cache Map 驱逐命中该用户 ID 的所有条目（含 inflight 队列）；两个写路径 upsert 完成后立即调用。
  - **[🟡 中危] Fix(auth): Supabase 首次登录并发注册竞争条件偶发 UNIQUE constraint 错误导致 401。**
    - 根因：`getOrCreateSupabaseBackedUser` legacy local runtime 路径用裸 `INSERT INTO auth_users` — 多个并发请求验证同一 access token 时，都通过了"用户不存在"检查，随后竞争插入同一邮箱，第二个请求因 UNIQUE 约束抛异常返回 null，上层 session 解析失败 → 401。
    - 修复：改用 `INSERT OR IGNORE INTO auth_users`，并检查 `changes === 0`（表示有并发请求已写入），此时重新从 DB 读取并返回胜出请求创建的用户记录；`auth_user_state_sync` 同步改为 `INSERT OR IGNORE` 防止双写。
  - **[🟡 中危] Fix(billing): Guest Checkout（未绑定 Stripe Customer）后 Customer Portal 不可用。**
    - 根因：当 Stripe 返回 `customer: null` 时（首次 guest checkout），`provider_customer_id` 为 null；此后调用 `/api/billing/portal` 直接失败，用户无法自助管理订阅。
    - 修复：`createBillingPortalSession` 已有防护（`!customer?.provider_customer_id` → 返回 `BILLING_PORTAL_UNAVAILABLE`），确保该错误码被正确映射为 503 状态；前端应据此引导用户重新完成付款以绑定 Customer ID。
  - **[🟢 低危] Fix(billing,membership): `MEMBERSHIP_PRICING` 缺少 monthly/annual 定价，导致计费校验和前端展示出错。**
    - 根因：`MEMBERSHIP_PRICING` 对象中 `lite`/`pro` 只定义了 `weekly` 价格；`getMembershipPriceCents('lite', 'monthly')` 因没有 `monthly` key 而 fallback 到 `weekly`（1900），checkout 流程传入的 `amountCents` 校验因此可能错误拒绝合法的月付/年付下单。
    - 修复：补全 Lite（月付 $69/年付 $799）和 Pro（月付 $99/年付 $1199）全周期定价，与 Stripe Dashboard 配置对齐。
  - **[🟢 低危] Fix(styles): `today-final.css` 存在 19 个重复的顶级 CSS 选择器块（历次 UI 迭代累积），导致样式覆盖不可预测。**
    - 修复：Python 脚本自动去重，保留每个选择器的最后（最新）定义，移除旧版冗余块。文件从 2487 行缩减至 2336 行（-151 行）。
  - **新增回归测试 `tests/bugfixValidation.test.ts`**：8 个测试用例分别覆盖 Webhook rawBody 空串拒绝、过期签名拒绝、有效签名通过、`normalizeStripeInterval` 映射正确性、月付 Pro 身份识别、cache 失效函数存在性、并发注册安全性、Guest Portal 不可用误返回、MEMBERSHIP_PRICING 完整性、CSS 重复选择器数量上限。

- **Feat(billing,membership): 正式接入周付 Stripe 结账链路，并把会员权限下沉到服务端执行。**
  - 支付主链路从本地 demo checkout 升级为 `Stripe Checkout + Customer Portal + Webhook`，后端新增 provider 配置、hosted checkout session、portal session、webhook 验签与订阅状态镜像；数据表同步补上 `provider_customer_id`、`provider_session_id`、`provider_subscription_id` 与 webhook 事件存档。
  - 定价统一收口为 `Lite $19/week`、`Pro $29/week`，app 与 landing 的套餐文案、billing cycle 展示和 `.env.example` 的 Stripe price 配置保持一致。
  - 前端 checkout sheet 删除伪信用卡输入，改为 plan summary + hosted checkout 跳转；会员中心新增 `Manage billing` 入口，Stripe 管理的降级/取消统一交给 billing portal。
  - 新增服务端 membership 状态与 usage 表，`Ask Nova` 日配额、`portfolio-aware` 的 Pro 限制、`broker handoff / live execution` 的 Lite 限制、以及 Free 档 Today 卡片裁剪现在都由后端强制执行，不再只依赖前端 localStorage 和 paywall 提示。
  - 补充 Stripe billing flow、Postgres runtime 兼容、以及 membership entitlement 的测试，覆盖周付 checkout、webhook 同步、免费档 AI 额度、Lite/Pro 权限边界。

- **Feat(auth): App 认证主链切到 Supabase Auth，并完成老用户迁移。**
  - 前端新增 Supabase 浏览器端 client 与运行时 `provider-config` 配置拉取，`login / signup / session / forgot password / recovery` 正式支持标准 Supabase Auth 流程。
  - 服务端新增 Supabase token 校验与 app 用户映射桥接，`/api/auth/session`、`/api/auth/profile` 和用户作用域中间件现在都能识别 `Bearer access token`。
  - Postgres 认证层新增 `auth.users` 读写能力，并为迁移窗口补上密码桥接：老账号即使先命中 legacy 密码，也能自动把密码同步回 Supabase Auth。
  - 新增老用户迁移脚本，将历史 `public.auth_users` 用户写入 Supabase `auth.users / auth.identities`；当前远端已完成 9 个有效账号迁移，跳过 1 个无效邮箱 `test`。
  - 补充 Supabase Auth 运行时与迁移桥测试，覆盖 `provider-config` 输出以及老账号登录后同步 `auth.users` 的过渡路径。

- **Feat(today): 首页 Today 主舞台继续向 landing 参考卡精修，并收成真正的一屏布局。**
  - 移除底部 `queue / more` 提示与任何背卡叠放，Today 首页现在只保留 `climate + 主卡` 两块，并强制在移动端一屏内完成展示。
  - Swipe 手势改为更贴手的即时拖拽更新，卡片拖到半程时可以自然停住，同时保留左右 / 上滑的大号状态标记反馈。
  - 默认行动卡继续向参考稿对齐：统一奶白底与淡青高光、放大 symbol / title 节奏、重做三块 stats 和三条 context pills，并恢复 `broker handoff + Ask Nova` 底部双按钮。
  - 首页 `climate` 和主卡外轮廓一起减小圆角，降低漂浮感，让中段内容与顶部栏、底部导航更像同一页里的连续界面。

- **Feat(today)：将 Today 主卡舞台进一步收向 Tinder 式决策界面。**
  - 保留顶部 climate 和底部导航不动，只重做中段卡片舞台，让主卡更高、更接近参考稿的单卡主体比例。
  - Today 主卡收成更极简的 landing 式结构：移除 broker CTA，只保留卡内长条 `Ask Nova` 按钮，并压缩标题、统计卡和 context pills 的留白节奏。
  - Climate 右侧视觉从环形轨道改成极简状态信号点，并统一 `safe / medium / danger` 的颜色映射，避免 `medium` 文案和视觉状态错位。

- **Fix(db): Supabase Postgres 连接池调优，消除 POSTGRES_FAST_TIMEOUT 告警。**
  - **根因**：EC2 (us-east-1) → Supabase Pooler (us-east-2) 跨 AZ 延迟 ~70ms，Mirror Pool 默认 `max: 3` 无 `connectionTimeoutMillis` 易耗尽排队超时；Admin 面板 soft timeout 仅 900ms，12+ 并行聚合查询在 `news_items`（8000+ 行）上无法按时完成，触发冷却后级联 degraded 告警。
  - **修复**：
    - Mirror Pool：`max: 3→6`，新增 `connectionTimeoutMillis: 3000`、`idleTimeoutMillis: 10000`、`statement_timeout: 8000`
    - Sync Worker Pool：`max: 3→6`，`connectionTimeoutMillis: 1200→3000`
    - Admin Pool：`max: 5→6`，`connectionTimeoutMillis: 1200→3000`
    - Admin soft timeout（liveOps + liveAlpha）：`900ms→3000ms`
  - 所有新默认值均通过 `NOVA_DATA_PG_*` 和 `NOVA_ADMIN_PG_*` 环境变量可覆盖。

- **Fix(hub): Admin 后台「系统健康」面板 Provider/Mode 显示修正。**
  - **根因**：`getNovaRuntimeState()`、`buildPrivateMarvixOpsReport()`、`buildPostgresOpsReport()` 三处均直接使用 `getNovaModelPlan().provider`（返回 ollama），未反映 Gemini/Groq 的 runtime override。面板显示 `ollama / deterministic-fallback` 但实际调用的是 `gemini / gemini-3.1-flash-lite-preview`。
  - **修复**：三处统一改用 `resolveEffectiveTextRoute('decision_reasoning')` 获取实际 provider 和 model。路由表也增加 `effective_provider` / `effective_model` 标注，保留 `base_provider` 用于追溯原始配置。

- **Fix(ai): 修复 Nova 任务失败时记录错误 provider 的问题，并为 Gemini 调用增加结构化可观测日志。**
  - **根因**：`runLoggedNovaTextTask` 的 error 和 skip 路径记录的是 `resolveBusinessTask` 返回的原始路由（`ollama/qwen3:4b`），而实际调用经 `runNovaChatCompletion` 内部 override 走了 Gemini。管理后台显示的 provider/model 信息具有误导性（如显示 `Marvix-Core / qwen3:4b` 实际调用的是 `gemini-3.1-flash-lite-preview`）。
  - **修复**：`client.ts` 新增 `resolveEffectiveTextRoute()` 导出函数，与 `runNovaChatCompletion` 内部路由 override 逻辑一致（Gemini → Groq → Ollama 优先级）；`service.ts` 在 `runLoggedNovaTextTask` 入口解析 `effectiveRoute`，skip/error/success 三条路径统一使用该路由写入 `nova_task_runs`。
  - **可观测性增强**：Gemini 调用前后增加 `[nova-gemini]` 结构化日志，记录模型名、任务类型、耗时和响应状态（OK/HTTP_xxx/NETWORK_ERROR/EMPTY_RESPONSE），支持通过 `journalctl | grep nova-gemini` 快速排障。

- **Fix(ai): 修复 `/api/engagement/state` 前端轮询导致 Gemini 调用 >100 次/分钟的频率爆炸问题。**
  - **根因**：`getDecisionSnapshot()` 的缓存判断要求 `contextHash` 精确匹配，但每次 runtime 数据刷新或服务重启后 hash 变化，导致每次 engagement/state 轮询（前端 3 个 IP 以每秒 3-5 次频率请求）都重新触发 `applyLocalNovaDecisionLanguage`（2 次 Gemini 调用）和 `applyLocalNovaWrapUpLanguage`（N 次 Gemini 调用）。5 分钟内产生 ~493 次 Gemini API 调用。
  - **修复**：引入 `NOVA_ENRICHMENT_TTL_MS`（默认 2 小时），三层节流：(1) `getDecisionSnapshot` 当天已有 Nova enriched snapshot 且在 TTL 内时跳过 contextHash 直接复用；(2) `getDecisionRowsForEngagement` 的快照复用窗口从 5 分钟提升至 TTL；(3) `getEngagementState` 新增 `wrapUpLanguageCache` 内存缓存，TTL 内跳过 `applyLocalNovaWrapUpLanguage` Gemini 调用。
  - **安全性**：wrap-up 缓存只缓存"已调用"标记，不缓存快照状态 diff，避免 daily_check_state 等实时状态被过期缓存覆盖。

- **Fix(test): 修复 `controlPlaneStatus` 和 `postgresMirrorConsistency` 两个 Postgres 热路径测试失败。**
  - **根因**：`readPostgresRuntimeStateBundle`（将 risk/signals/market_state/performance 合并为单次 CTE 查询）在测试编写后引入，但测试未添加对应 mock。`controlPlaneStatus` 中未 mock 的 bundle 查询连接假 Postgres URL 失败后触发 60 秒冷却期，导致后续所有已 mock 的个体读取函数被短路；`postgresMirrorConsistency` 中 `Pool.prototype.query` mock 按 SQL 文本匹配 `signals` 抛出异常，但 bundle SQL 包含全部表名，导致整个查询失败而非仅 signals 部分。
  - **修复**：两个测试均添加 `readPostgresRuntimeStateBundle` mock；`postgresMirrorConsistency` 的 `listSignals` spy 条件从 `limit === 60` 更新为兼容 `limit === 24`（匹配 `RUNTIME_STATE_SIGNAL_LIMIT`）。

- **Fix(format): 修复 7 个文件的 Prettier 格式问题，确保 CI format check 通过。**
  - 格式化 `SignalsTab.jsx`、`TodayTab.jsx`、`useAppData.js`、`queries.ts`、`signalListProjection.ts`、`brand-reset.css`、`runtimeRepository.test.ts`。

- **Feat(billing,membership): 客户端会员体系接入 checkout 入口与后端订阅状态。**
  - 新增 `Free / Lite / Pro` 的会员权益模型、Today/Ask Nova/My 入口的升级引导，以及独立的 `Membership & Plans` 页面与 paywall sheet。
  - 新增移动端 H5 checkout 底部支付页，升级按钮不再直接切本地 plan，而是统一走 checkout session；未登录或本地 API 不可用时自动回退到 preview 模式，方便本地演示。
  - 后端新增 `billing_customers`、`billing_checkout_sessions`、`billing_subscriptions` 三张表，并补齐 `/api/billing/state`、创建 checkout、完成 checkout、取消订阅接口。
  - 新增 Postgres runtime 测试，确认 Supabase/Postgres 主路径下 checkout 与订阅激活不会回退本地 legacy local runtime。

- **Feat(app): Today 改为 landing 风格的单卡决策流，并保留完整 Browse 入口。**
  - `Today` 主流程重做为单张 `Action Card` + 卡堆预览，支持 `左滑放弃 / 右滑执行 / 上滑暂存`，并加入更接近 Tinder 的圆形操作按钮与极简反馈。
  - 决策卡视觉语言对齐 landing page 行动卡，统一顶部 glow、渐变 accent bar、pill 标签、stats/context 信息块与 `Powered by Marvix AI Engine` / `Ask Nova` 底部动作区。
  - `Ask Nova` 支持从 `Today` 卡片直接带入当前标的信息进入提问界面，减少重复输入。
  - 恢复底部主导航中的 `Browse` 入口，确保原有高完成度的发现页体验不被新 `Today` 流程覆盖。

- **Perf(admin): 管理员后台 Tab 切换卡顿修复 -- 缓存层 + 超时控制 + 后端 TTL 全面提升。**
  - **P0 -- 前端请求超时控制**：`adminApi.js` 所有 fetch 增加 `AbortController`，10s 超时强制 cancel，防止请求永远 pending。
  - **P0 -- Tab 数据模块级缓存**：`useAdminResource` hook 升级为跨 Tab 生命周期缓存（30s TTL），首次加载后切换 Tab 瞬间呈现无需重请求，同时后台静默刷新保持数据新鲜。
  - **P1 -- 后端缓存 TTL 提升**：Admin 快照缓存全面提升 -- Users 缓存 15s→30s，Overview fresh 12s→20s / stale 60s→90s，AlphaRegistry 15s→30s，liveAlpha/liveOps Postgres 缓存 15s→30s。
  - **Chore(tooling)：增强 EC2 skill，新增 admin 端点 benchmark 和部署验证操作。**
- **Perf(auth): 管理员鉴权热路径去副作用，显著减少 Postgres 往返与本地镜像写入。**
  - **P0 -- session touch 节流**：Postgres 会话读取改为按 5 分钟活动窗口节流 `pgTouchSession`，避免每次 admin 校验都触发远端 `UPDATE`。
  - **P0 -- admin 角色判定并入 session 读取**：新增 `pgGetAdminSessionBundle`，在 session 查询内直接取回角色，移除额外的 role 查询。
  - **P0 -- 移除 `getAdminSession` 热路径角色写入**：配置型管理员现在在鉴权阶段直接合成 `ADMIN` 角色，不再在每次 session 校验时做 `upsertAuthUserRole`。
  - **Fix -- Postgres roles 兼容解析**：兼容 `text[]` 被驱动解析为字符串（如 `'{ADMIN}'`）的返回形态，避免管理员登录后 session 校验误判无权限。
  - **Fix -- admin 登录错误文案纠偏**：`admin` 前端现在会把 `502/503/504`、请求超时和服务端 `500` 统一显示为“管理员登录服务当前不可用”，不再误导成“当前账号没有管理员权限”。
  - **Fix -- control-plane/status 减压**：控制面板状态新增 60s 服务端缓存 + inflight 去重，前端静默刷新不再每 120s 同步拉这个重接口，降低单线程 API 被控制面板轮询拖死的概率。
  - **Fix -- public control-plane 冷启动风暴继续减压**：前台首屏不再主动拉取 `control-plane/status`，仅在 Data / Learning tab 按需请求；后端把 `guest-*` 的 control-plane 缓存键归一到共享 public scope，避免每个匿名访客都触发一轮独立的重查询。
  - **Fix -- 生产启动 I/O 风暴止血**：`auto-backend` 现在会在已有新鲜行情数据时跳过启动期 full initial backfill，避免每次 deploy 都对同一个 `legacy local runtime store` 重灌历史数据；`pg-primary-read` 在 Supabase 超时后会进入短暂冷却，避免每个请求都重复等待远端超时再回退本地库。
  - **Fix -- warm start 不再重跑整段重初始化**：当 US / CRYPTO 两个市场都已有足够新鲜的代表性数据时，`auto-backend` 会直接跳过启动期 `free data flywheel + validation + runtime derivation + evolution/training/discovery` 全套初始化；同时支持 `NOVA_AUTO_BACKEND_SKIP_INIT=1` 明确禁用启动期初始化。
  - **Fix -- 公共热接口去同步回退**：`/api/assets`、`/api/signals`、`/api/market-state`、`/api/performance`、`/api/risk-profile`、`/api/runtime-state`、`/api/evidence/signals/top` 与无持仓的 `decision/today` 现在优先走真正异步的 Postgres 读取路径；当 Supabase 慢或超时时，默认返回降级/空数据而不是立刻掉回同步 legacy local runtime 热路径把 API 主线程拖死。
  - **Fix -- Phase 2 热路径继续异步化**：`control-plane/status` 与 `control-plane/flywheel` 现在优先走异步 Postgres 聚合，不再默认扫本地 legacy local runtime 的 workflow/news/execution 热路径；热路径模式下 `execution_governance` 会返回轻量默认值，避免为了控制面板概览再触发 live/paper reconciliation。完整个性化 `decision/today` 在热路径模式下也会跳过本地 decision snapshot 读写和本地 Nova enrich，改为直接返回基于异步 PG runtime 的个性化结果，避免再次把主线程拖回同步 legacy local runtime。
  - **Fix -- EC2 deploy 健康检查纠错**：部署工作流改为轮询 `/healthz` 并严格以 `200` 判成功，修复 `curl` 超时被拼成 `000000` 仍误判成功的问题。
  - **Test -- Postgres admin hot path 回归覆盖**：新增测试覆盖 touch 节流与配置型管理员无需额外 role I/O 的判权路径。

## 10.18.3 (2026-03-29)

- **Perf(admin)：admin 系统健康与总览端点从 65s 降至秒级（legacy local runtime 查询优化）。**
  - **索引覆盖**：为 `nova_task_runs`、`news_items`、`workflow_runs`、`alpha_candidates`、`alpha_lifecycle_events` 添加 `created_at_ms DESC` / `updated_at_ms DESC` 单列索引，消除 6 个无 WHERE 条件的 ORDER BY 全表扫描。
  - **N+1 消除**：`buildAlphaRegistrySummary` 中对 200 个 alpha candidates 的逐个查询（200x `getLatestAlphaEvaluation` + 200x `listAlphaShadowObservations`，共 ~408 次 legacy local runtime 查询）改为 2 次批量查询（`getLatestAlphaEvaluationsBatch` + `getAlphaShadowStatsBatch`）。
  - **SELECT 瘦身**：`listNovaTaskRuns` 新增 `slim` 模式，admin 调用方跳过 `input_json`、`context_json`、`output_json` 三个大字段（每行可达数十 KB），减少 EBS 磁盘 I/O。

## 10.18.2 (2026-03-29)

- **Security：移除误入 repo 的 SSH 私钥，`.gitignore` 添加 `*.pem` 规则。**
- **Chore(tooling)：新增 EC2 实例管理 skill（`.claude/skills/ec2/`），支持服务状态/日志/系统资源/部署状态查看。**

## 10.18.1+cleanup (unreleased)

- **Chore(cleanup)：清理零引用前端/后端残留与静态资源，并修复 `RiskTab` 的 `locale` 接线。**
  - 删除零引用组件：`ChatAssistant`、`MoreTab`、`QuickAccessSheet`、`SystemStatusBar`、`VelocityTab`、`WhyTab`、`GridOverlay`、`NoiseOverlay`。
  - 删除零引用后端入口与工具：`src/server/api/vercelChatHandler.ts`、`src/utils/downloads.js`。
  - 删除零引用静态资源：未使用的 app/root 图标源图、landing 截图素材与未引用的旧 app 资源。
  - 清掉一批已验证零调用的内部函数与不必要导出，减少维护噪音。
  - 修复 `App -> RiskTab` 传参错误，改为传递 `locale` 而不是未消费的 `lang`。

## 10.18.1 (2026-03-29)

- **Perf(admin)：admin 总览加载性能全面优化，首屏响应从数十秒降至秒级。**
  - **P0 -- AlphaRegistryBundle 缓存去重**：`buildAlphaRegistryBundle` 增加 15s TTL 内存缓存 + inflight 请求去重，消除 overview 请求中因 alpha + system 快照各自调用一次造成的重复 Postgres 查询（约减少 40% 查询量）。
  - **P0 -- Overview 响应 stale-while-revalidate**：`buildAdminOverviewSnapshot` 增加 12s fresh / 60s stale-while-revalidate 缓存，过期后返回旧数据并在后台异步刷新，同时 deduplicate 并发请求。
  - **P1 -- Users 快照缓存**：`buildAdminUsersSnapshot` 增加 15s TTL 缓存，避免 8 表 JOIN + 6 个全表聚合子查询在短时间内重复执行（此查询通过 `queryRowsSync` 阻塞主线程）。
  - **P1 -- Signals 匹配算法优化**：`buildAdminSignalsSnapshot` 中 execution-to-signal 匹配从 O(n*m) 嵌套 filter 改为 `Map<signal_id, Execution[]>` 预构建 + O(1) lookup（160 signals * 240 executions = 38,400 次比较降至约 400 次）。
  - **P2 -- 前端渐进式加载**：新增 `/api/admin/overview/headline` 轻量端点（仅读取本地 legacy local runtime 数据，不触发 Postgres 级联），OverviewPage 先加载 headline 立即展示用户/信号/工作流指标，再在后台加载完整 overview 后无缝替换。
  - **Fix -- SWR 后台刷新异常安全**：stale-while-revalidate 后台 promise 增加 `.catch()` 消费 rejection，防止 Postgres/网络抖动时未处理拒绝打掉 API 进程。
  - **Fix -- OverviewPage 双请求状态机**：重写 headline/overview 双请求合并逻辑 -- loading 仅在无任何数据且有请求在飞时展示；error 仅在两请求均已结束且均无数据时展示；overview 永久失败时在页面顶部展示警告横条而非静默停留在部分数据；`isPartial` 驱动策略库存/AI 因子/生命周期区域显示加载占位，不再误报零值。
  - **Test -- headline 端点与 cache 分支覆盖**：新增 3 个测试覆盖 `/api/admin/overview/headline` 返回 `_partial: true` 的部分数据、headline 返回缓存完整数据、overview cache 在 TTL 内返回相同快照；`beforeEach` 调用 `_resetAdminCachesForTesting()` 确保模块级缓存不在用例间泄漏。

## 10.18.0 (2026-03-29)

- 发布类型：**minor**（新功能 + 重要修复）

- **Fix(全局)：修复 code review 发现的 17 项 bug 与代码质量问题。**
  - **前端崩溃修复**：`TodayTab` 中 `handleSignalAction` 在 `const` 声明前被引用（temporal dead zone），点击交易按钮时 `ReferenceError` 崩溃；`todayPickSymbol` 从未声明，fallback 路径同样崩溃。
  - **Postgres 运行时修复**：`PostgresRuntimeRepository` 补齐 `upsertNovaReviewLabel` / `listNovaReviewLabels` 覆写，防止 Postgres 模式下调用基类触发 `NOT_IMPLEMENTED` 崩溃；`postgresSyncBridge` 批量写入补上事务包裹，恢复与 legacy local runtime 版本一致的原子性保证；worker `error` 事件处理改为存储错误并在 `waitForResponse` 循环顶部（`receiveMessageOnPort` 之前）检查，确保 worker 崩溃后调用方拿到原始异常而非 `TypeError`；`ensureSequences` 加 `LOCK TABLE` + 事务防止多进程冷启动竞态。
  - **数据丢失修复**：`derive-runtime-state.ts` 和 `run-evidence.ts` 补齐 `flushRuntimeRepoMirror()` 调用，防止 Postgres mirror 启用时写入丢失。
  - **内存泄漏修复**：`liveOps.ts` 补齐与 `liveAlpha.ts` 相同的 `pruneExpiredCache` + 定时清理机制（6 个 cache Map 此前按日累积无上限）；`adminSessionCache` 增加 5 分钟周期性过期清扫；`recentlyModifiedRoles` 的 `setTimeout` 改为条件删除，避免多次角色修改时首次定时器提前清除后续追踪。
  - **并发安全修复**：`redeemManualVipDay` 余额检查移入事务内部，Postgres 路径使用 `SELECT ... FOR UPDATE` 防止并发双重扣减；`appendPointsLedger` 新增 `knownBalance` 参数，避免落账时二次读取绕过行锁（消除 READ COMMITTED 下的 stale-read 窗口）。
  - **Landing a11y/UX 修复**：Heatmap Evidence 按钮在无选中 cell 时禁用；三组控件从错误的 `tablist/tab` 语义改为 `role="group"` + `aria-pressed`（filter 按钮组的正确语义）；Evidence drawer 增加 Escape 关闭和自动聚焦。
  - **测试覆盖补充**：`performanceOptimization.test.ts` 补齐 `/api/outcomes/recent` 端点覆盖；`manualServicePostgresRuntime.test.ts` 新增事务 rollback 路径测试，并直接断言 `knownBalance` 会驱动积分落账；新增 `postgresSyncBridge.test.ts`，覆盖同步查询、worker error 原样透传、以及崩溃后的桥接重建路径。

- **Feat(onboarding)：将 intro onboarding 收成纯文字引导。**
  - 前三屏移除截图式卡片、手机 mockup 和 broker 面板，只保留更短的标题、副标题与说明文案。
  - intro 首屏改为真正的 text-only 版式，重新分配可用视口高度，避免手机端出现元素叠放、遮挡和底部按钮挤压。

- **Feat(ui)：app 视觉对齐 landing，并修复手机端 onboarding 版式。**
  - app 全局底色、玻璃卡面、按钮和主要页面表面统一切到 landing 的白底与蓝粉渐变体系，移除旧的 beige 主底色。
  - `Today` 页改成更极简的“日期 + 状态话 + 单张主卡”结构，并加入 `左滑今天不做 / 右滑接受今天计划 / 下滑稍后再看` 的判断型手势语义。
  - intro onboarding 前三屏补齐手机端视口适配，重新为海报舞台和底部 CTA 预留空间，避免标题、卡片和登录按钮在短视口下互相遮挡。

- **Feat(landing)：将 Data Portal 升级为可交互研究门户。**
  - 新增统一 `control bar`，支持在 `Time Window / Benchmark / Mode` 之间切换，并让回测、热力图、Monte Carlo 与基准对比共用同一组上下文。
  - 为 `Backtest`、`Heatmap`、`Monte Carlo`、`Strategy vs Benchmarks` 增加联动高亮、可点击二级状态与 `Evidence drawer`，让图表之间可以相互解释，不再只是静态展示。
  - 为 `Monte Carlo` 增加 `Scenario / Band` 控件，为月度热力图增加 tooltip 与年份/月度锁定焦点，同时兼顾桌面端 hover 与移动端 tap 的可持续选中态。
  - 调整 `Data Portal` `control bar` 的宽度规则，使其在桌面端和移动端都与页面主内容保持同一条版心边界。

- **Fix(landing)：校准 Data Portal 展示型业绩数据。**
  - 将 `Data Portal` 回测面板中的 `Sharpe` 调整为 `1.61`，并同步重估净收益、回撤、胜率与柱状走势，使整组表现落在更可信的风险收益区间。
  - 上调但收敛 `Strategy vs Benchmarks`、`Monte Carlo` 和月度热力图数据，保持策略表现高于 `S&P 500 / Nasdaq`，同时避免与新的 Sharpe 水平失真。
  - 保持现有 count-up 与图表动效不变，只更新展示数据源与对应动画终值。

- **Feat(db,auth,manual,admin)：生产运行时继续去 legacy local runtime，主业务链路可直接跑 Supabase/Postgres。**
  - `auth` 现在会把 `NOVA_DATA_DATABASE_URL` 视为合法的 Postgres 鉴权库回退来源；在 `postgres` 运行时，本地 legacy local runtime auth mirror 不再是必需条件。
  - `manual service` 新增 Postgres 同步查询与事务桥接路径，积分、邀请、预测市场等流程可直接走 Supabase 业务库，不再依赖本地 `legacy local runtime store`。
  - `admin users` 与 `research ops` 的本地快照补上 Postgres 查询分支；即便 `postgres mirror` 回退，本地管理视图也不会因为 `getDb()` 被禁用而失效。
  - `postgresSyncBridge` / `postgresSyncWorker` 新增事务命令支持，为后续更多业务写路径切到 Postgres 提供同步事务基础。
  - 新增 Postgres 运行时回归测试，覆盖 `auth`、`manual` 和配置切换关键路径，确认 `NOVA_DATA_RUNTIME_DRIVER=postgres` 下不会偷偷回退 legacy local runtime。

- **Docs(nova)：归档 2026-03-27 生产策略包回测产物。**
  - 将 11 组 `production_strategy_pack_*.json/.md` 结果写入仓库，保留从保守版到强化版的完整演进轨迹。
  - 这些产物覆盖年化、夏普、回撤、鲁棒性和过拟合审计结果，方便后续做版本对比与对外汇报。

- **Feat(onboarding)：重做 intro onboarding 前三屏。**
  - 第一屏延续浅色背景与 landing 风格行动卡皮肤，保留截图式中间主卡加两侧扇出切换的交互布局。
  - 第二屏改为 `Ask Nova`，移植 landing page 的手机演示动效，按 `typing → thinking → reply reveal → scroll` 时序展示问答过程，并适配桌面端与移动端。
  - intro 页序收敛为 `Meet NovaQuant → Ask Nova → Move with your broker`，让 onboarding 首轮叙事更贴近产品核心路径。

## 10.17.1 (2026-03-28)

- 发布类型：**patch**（基建增强）

- **Feat(landing)：新增 Data Portal 子页面。**
  - 顶部导航新增 `Data Portal` 入口，并为子页面补充更明显的 `main page` 返回按钮。
  - 新增独立 `data-portal/` 入口页，展示 `Backtest`、`Flywheel`、`Data Fabric / Audit Loop` 三个模块。
  - 复用现有 landing 视觉语言，新增专属页面组件、样式文件与多入口 Vite 构建配置。

- **Feat(landing)：统一 CTA 语言并重做 Ask Nova 设备演示。**
  - 首页、导航、Voices 和 Data Portal 的关键 CTA 文案统一为 `Get Started`，并为主 CTA 加入更明显的品牌渐变流动效果。
  - `Ask Nova` 区从静态截图改为真机比例手机 mockup，按 `typing → 发送清空 → thinking → 回复展开并自动滚动` 的时序展示完整解释。
  - 手机外壳按 Apple `iPhone 17 Pro` 机身比例重构，内部 UI 独立缩放，提升设备尺寸与界面分辨率感的一致性。

- **fix(landing): 去掉 Data Portal 底部与页脚之间的白色断层。**
  - 为 `Data Portal` 页面增加专用间距覆盖，让 `Data Fabric` 末屏与 `LegalFooter` 紧贴，避免深色背景之间露出浅色白边。
  - 保持修复范围只在 `page-shell-portal` 下生效，不影响主 landing 其他 section 的全局间距规则。

- **feat(landing): 扩展 Data Portal 分析层并重构首页封面。**
  - 新增 `Analytics` 区块，集中展示 `月度收益热力图`、`Monte Carlo 模拟` 与 `策略 vs S&P 500 / Nasdaq` 基准对比，并为顶部导航补充对应锚点。
  - `Data Portal` 首页 hero 改为全屏居中的封面构图，只保留门户定位文案、原则 chips 与核心统计卡，不再预先重复下方模块内容。
  - 调整 `Data Portal` 首屏的氛围色块、数字卡层次与 section 衔接，整体更接近统一的 landing editorial 视觉语言。

- **fix(landing): 精修 Data Portal 首页与分析图表动效。**
  - 删除 `Data Portal` 首页右侧遗留的 research replay 玻璃面板，首页回归纯居中的封面布局，避免与下方模块内容重复。
  - 为 `Heatmap`、`Monte Carlo`、`Strategy vs Benchmarks` 三张分析卡补齐真实图表动画：热力图按格点亮、路径按顺序绘制、柱状图自底部生长。
  - 为 `Replay windows`、回测指标、Monte Carlo 统计值、benchmark 百分比和 `Alpha vs S&P 500` 补充 count-up 动画，并统一 `prefers-reduced-motion` 兜底。
  - 收短 `Backtest / Analytics / Flywheel / Data Fabric` 各 section 标题及 analytics 卡片标题，减少营销式长句。

- **feat(admin): 管理后台整体视觉语言向 landing page 对齐。**
  - 为 `admin` 入口新增统一品牌背景层，复用暖白底、蓝粉薄荷光斑、细网格和玻璃质感卡片语言。
  - 重做侧栏、顶栏、登录页、统计卡、面板、表格、状态标签和图表条形/环形样式，在不改页面架构的前提下整体换皮。
  - 将总览页生命周期和活跃率等关键图表配色切换到 landing 的品牌色带，减少后台与官网之间的视觉割裂。

- **feat(admin): 重构后台信息架构，让核心数据一眼可读。**
  - 一级导航从 6 项收敛为 `总览 / 用户增长 / 策略工厂 / 信号执行 / 系统健康` 5 项，合并 `Alpha 实验室` 与 `今天后台成果`。
  - 新增 `策略工厂` 页面，把 Discovery、Shadow、评估、研究回测与训练飞轮合并到一屏，改用统一事件流和重点候选队列表达产出。
  - `总览` 改为只展示跨域脉冲与异常摘要，`用户增长`、`信号执行`、`系统健康` 各自收敛为更适合运营判断的首屏结构，减少默认大表和重复分布图。

- **fix(admin,auth,db): 管理后台首刷过慢时优先快速回退并复用缓存。**
  - `总览` 聚合接口改为并发拉取 `users / alpha / signals / system / workflows`，避免刷新时串行等待多个快照源。
  - 为 `alpha` 与 `research ops` 的 `EC2 live upstream` / `Postgres mirror` 读取链路增加软超时、失败冷却和短时缓存，远端慢或不可达时优先返回本地回退数据。
    - Upstream 软超时 1200ms，硬超时 6500ms；缓存命中有效期 15s，失败冷却 30s（全部可通过环境变量配置）。
    - Postgres 软超时 900ms，缓存有效期 15s，失败冷却 30s。
  - 为 `Postgres mirror` 连接补上连接超时与空闲超时，并对 admin session 做短缓存（默认 5s，可通过 `NOVA_ADMIN_SESSION_CACHE_TTL_MS` 配置），减少一次页面刷新中的重复鉴权解析。
  - Admin session 缓存在权限变更时主动失效，防止权限回收后最长 5s 才生效的问题。

- **Feat(ci)：GitHub Actions 自动部署 EC2 流水线。**
  - **新增 `.github/workflows/deploy-ec2.yml`**：push 到 `main` 后自动触发 CI → Deploy 串行流水线。
  - **CI 门禁复用**：通过 `workflow_call` 复用 `ci.yml`（lint → format → typecheck → test → build），CI 失败时阻断部署。
  - **部署流程**：SSH 连接 EC2 → `git reset --hard origin/main` → `npm ci --omit=dev` → `npm run build` → `systemctl restart marvix.service marvix-backend.service`。
  - **健康检查**：部署后自动验证两个 systemd 服务状态 + API HTTP 响应码，失败时输出最近 15 行 journalctl 日志并标记 workflow 失败。
  - **手动触发**：支持 `workflow_dispatch`，可选 `skip_ci` 参数跳过 CI 直接部署。
  - **并发控制**：`concurrency.group: deploy-ec2` 防止多个部署同时执行。
  - **更新 `ci.yml`**：添加 `workflow_call` trigger，允许被 deploy workflow 作为 reusable workflow 调用。

- **Fix(ec2)：修复 AWS Console EC2 Instance Connect 连接失败。**
  - 根因：`ec2-instance-connect` 包已安装但 `AuthorizedKeysCommand` 未配置到 sshd。
  - 修复：创建 `/etc/ssh/sshd_config.d/50-ec2-instance-connect.conf`，配置 `eic_run_authorized_keys` 脚本，重启 SSH 服务。
  - 安全组：添加 `3.16.146.0/29`（us-east-2 EC2 Instance Connect 服务 IP）的 22 端口入站规则。

---

## 10.17.0 (2026-03-28)

- 发布类型：**minor**（架构重构）

- **Refactor(deploy)：清理空壳部署单元，统一四端部署描述。**
  - **删除 `server/` 目录**：该目录只是 `api/index.ts` 的空壳包装，无真实代码，删除以减少维护负担。
  - **统一部署口径**：更新 10 份文档（CLAUDE.md、AGENTS.md、README.md、api/README.md、REPOSITORY_OVERVIEW.md、REPO_RUNBOOK.md、PROJECT_MEMORY.md、CURRENT_PRODUCT_DOCUMENT_ZH.md、SESSION_HANDOFF_PROTOCOL.md、NOVAQUANT_BACKEND_ARCHITECTURE_AFTER_REFACTOR.md），将部署边界描述从"五端（landing/app/admin/server/model）"统一为"四端（landing/app/admin/仓库根目录）"。
  - **API 入口路径确认**：`api/index.ts` → `src/server/api/app.ts`。
  - 验证：`npm run lint`、`npm run typecheck`、`npm run build`、`npm test` 全部通过（828 tests）。

---

## 10.16.1 (2026-03-28)

- 发布类型：**patch**（审计修复）

- **Fix(nova,signal)：生产策略包 13 项审计修复（commit 560eb44 审计报告）。**
  - **BUG-1 — CRYPTO mean_reversion 无效计算**：`buildConfigGrid()` 为 CRYPTO 生成 `mean_reversion` 配置，但入场条件 `meanReversionOk` 硬编码 `market === 'US'`，导致这些配置始终产出 0 笔交易、浪费算力并污染 bundle 选择。修复：移除 `crypto_meanrev_12` 和 `crypto_meanrev_16` 配置。
  - **BUG-2 — bundleSelectionScore 排序依赖**：`bundleSelectionScore()` 使用 `configs[0]`（按 `config_id` 字母序排列）作为基准评分，导致 `tightness_score` 奖励取决于命名而非策略质量。修复：新增 `primaryConfig` 参数，优先使用 `trend_breakout > trend_pullback > configs[0]`。
  - **BUG-3 — OOS 剪裁时间依赖 Object.keys 顺序**：`splitValidation()` 和 `walkForward()` 使用 `Object.keys(testBars)[0]` 选取 symbol 计算剪裁起始时间戳。修复：新增 `safeClipStartTs()` 辅助函数，取所有 symbol warmup 索引处时间戳的 `Math.max`。
  - **ISSUE-1 — Regime 键名不一致**：`productionStrategyPack.ts` 使用 `risk_off`，模拟引擎使用 `high_volatility` 和 `risk_off` 作为独立策略池策略。修复：`portfolioSimulationEngine.js` 新增显式键名验证 `STRATEGY_POOL_POLICY[rawPolicyKey] ? rawPolicyKey : 'range'`。
  - **ISSUE-2 — capital_split 权重稀释**：`combineDailySeries()` 遍历所有 packs 跟踪权重总和/计数，但 `weights` 仅包含当日有数据的 `activePacks` 条目，导致无数据日稀释平均权重。修复：内层循环从 `for (const pack of packs)` 改为 `for (const { pack } of activePacks)`。
  - **ISSUE-3 — weakEvidence sample_size 阈值不灵活**：`weakEvidence()` 硬编码 `sample_size < 60`，walk-forward 窗口和压力场景自然拥有更少 bar 数，导致子窗口评估不公平。修复：新增可选 `minSampleSize` 参数（默认 60）。
  - **ISSUE-4 — signal_delay_bars 未真正延迟入场**：原始实现仅偏移索引比较，`signal_delay_bars=1` 时入场仍发生在信号后第一根 bar。修复：引入 `pendingEntryCountdown` 倒计时机制，`signal_delay_bars=1` 确保入场延迟至信号后第 2 根 bar。
  - **EDGE-1 — 空 market plan 退化守卫**：`buildMarketPlan()` 在 `compositeBars.length < 10` 或 EMA/ATR 全 NaN 时早返回空 Map，防止所有 bar 静默回退至 `range` regime。
  - **EDGE-2 — partial_fill_probability 默认值过于乐观**：从 1.0（无成交拖拽）改为 0.92（保守 8% 部分成交拖拽）。
  - **EDGE-3 — Monte Carlo seed 不稳定**：seed 从 `returns.length + trades.length + 17` 改为引入首末 bar 时间戳和乘法散列，单根 bar 变化不再翻转全部 120 次模拟。
  - **EDGE-4 — normalizeWeights 潜在 NaN**：除法结果增加 `Number.isFinite` 检查，NaN/Infinity 归零。
  - **RT-1 — Promotion Gate Sharpe 容差过宽**：新增 `max_sharpe_delta_from_target: 0.15`，要求平均 Sharpe ≥ 1.05（目标 1.2 - 0.15），防止大量任务以 Sharpe 0.9~1.1 通过时 gate 意外开启。
  - **RT-2 — 任务多样性未验证**：`sampleTaskSpecs()` 生成后验证 risk profile × duration 两维多样性，不足时自动注入差异化任务。
  - 测试套件：828/828 测试通过，TypeScript 严格模式 0 错误。

---

## 10.16.0 (2026-03-28)

- 发布类型：**minor**（新功能）

- **Feat(nova)：生产级策略包生成工具 `productionStrategyPack.ts`。**
  - 新增 `generateNovaProductionStrategyPack()`：根据市场数据自动生成可直接用于实盘的生产级策略包。
  - 支持三种策略风格：`trend_breakout`（趋势突破）、`trend_pullback`（趋势回撤）、`mean_reversion`（均值回归）。
  - 支持 `1d` 和 `4h` 两种执行时间框架，含完整策略配置（止损/止盈/仓位/ATR 参数）。
  - 集成 `executionRealismModel` 执行真实性模型，对滑点、流动性进行建模。
  - 新增 CLI 脚本 `scripts/run-nova-production-strategy-pack.ts`。

- **Feat(nova)：策略健壮性训练系统 `robustnessTraining.ts`。**
  - 新增 `runNovaRobustnessTraining()`：对策略进行滚动回测（rolling OOS）和参数扰动分析（perturbation），验证策略参数在市场变化下的稳定性。
  - 分市场（US/CRYPTO/ALL）和风险偏好（conservative/balanced/aggressive）分别评估。
  - 输出每个市场的 `robust_parameter_intervals`（稳健参数区间）和 `rolling_oos_pass_rate`。
  - 新增 CLI 脚本 `scripts/run-nova-robustness-training.ts`。
  - 新增 API `POST /api/nova/training/robustness`。

- **Feat(risk)：风险 Governor 模式升级与方向感知增强。**
  - 引入四级风控模式升级机制：NORMAL → CAUTION → DERISK → BLOCKED（`MODE_RANK`）。
  - 新增 `normalizeMarket()` / `normalizeDirection()` / `safeNumber()` 辅助函数。
  - 新增 `signalEntryMid()` 处理信号入场价格区间。
  - 大幅扩展风控逻辑，支持连亏计数和逐仓方向感知。

- **Feat(risk)：风险 Bucket 分级阈值全面增强。**
  - 为 Conservative/Balanced/Aggressive 三种风险配置新增多个风控阈值：
    - `max_position_cap_pct`（最大持仓上限）、`instrument_concentration_cap_pct`（单品种集中度上限）、`same_direction_cap_pct`（同向仓位上限）
    - `weekly_loss_limit_pct` / `monthly_loss_limit_pct`（周/月损失限制）
    - `drawdown_caution_pct` / `drawdown_derisk_pct` / `drawdown_hard_stop_pct`（回撤分级阈值）
    - `loss_streak_caution_count` / `loss_streak_block_count`（连亏警告/阻断计数）

- **Feat(db)：业务数据库审计脚本增强。**
  - 历史业务库审计脚本大幅增强（+145 行）。

- **Feat(deploy)：生产环境配置完善。**
  - 更新 `.env.example`、`deployment/aws-ec2/marvix-backend.env.example`、`deployment/aws-ec2/marvix.env.example` 生产环境变量。
  - 更新 `docs/AWS_EC2_DEPLOYMENT.md` 文档。

- **Test：新增 5 个测试文件覆盖全部新功能。**
  - `tests/novaProductionStrategyPack.test.ts`（195 行）、`tests/novaRobustnessTraining.test.ts`（278 行）
  - `tests/portfolioSimulationSharpeUpgrade.test.ts`（324 行）
  - `tests/riskGovernorEdgeCases.test.ts`（138 行）、`tests/riskBucketSystemDrawdownControl.test.ts`（65 行）

---

## 10.15.1 (2026-03-28)

- 发布类型：**patch**（工程规范）

- **Chore(ci)：Pre-commit 全链路质量门禁。**
  - **新增 `check-changelog.mjs`**：强制每次提交包含 CHANGELOG.md 更新，校验 `package.json` version 与 CHANGELOG 最新版本号一致，`src/` 变更未伴随 `docs/` 更新时发出软警告。
  - **新增 `check-commit-msg.mjs`**：Conventional Commits 格式校验 —— type 白名单（8 类）、scope 白名单（60+ 模块）、标题必须英文（ASCII only，body 可用中文）、小写开头、≤72 字符、不以句号结尾、title/body 空行分隔。
  - **新增 `.husky/commit-msg` hook**：自动触发 commit message 校验。
  - **更新 `.husky/pre-commit` hook**：执行顺序 changelog 检查 → `npm run verify`（lint → typecheck → test → build → build:landing）→ lint-staged（Prettier 格式化）。
  - **新增 `npm run check:changelog`**：可独立运行 changelog 策略检查。
  - 绕过方式：`SKIP_CHANGELOG_CHECK=1` / `SKIP_COMMIT_MSG_CHECK=1`，用于纯基建提交。

---

## 10.15.0 (2026-03-28)

- 发布类型：**minor**（新功能）

- **Feat(onboarding)：重建引导流 Intro 海报场景系统。**
  - **新增 `IntroPoster` 组件**（`OnboardingFlow.jsx` +434 行）：4 个全屏品牌海报场景，替代原有简单文案页面。
  - **场景 1 — Meet NovaQuant**：品牌介绍页，三张叠层卡片（NVDA/TSLA/AAPL 推荐），粉/蓝/黄/绿色块装饰，`conviction`、`risk` 指标展示。
  - **场景 2 — Read the Day First**：市场气候页，Wait/Act 比例轮盘、风险等级统计卡、`Trade lighter` / `Wait for confirmation` / `Size down first` 标签组。
  - **场景 3 — Ask Nova Directly**：AI 对话交互展示，模拟 chat bubble 与建议 chip。
  - **场景 4 — Broker**：券商连接引导，展示连接流程与状态卡片。
  - **视觉系统全面升级**（`onboarding.css` +1,315 行）：每场景独立渐变背景 + `radial-gradient` 光晕，精细卡片 UI（毛玻璃、阴影、圆角），`clamp()` / `min()` 响应式布局，中英文 `locale` 感知双语文案。

---

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
  - **BUG-3 —— 混合 Postgres 回退路径中 legacy local runtime 行过期**：当部分 Postgres 读取成功、其他回退至 legacy local runtime 时，`loadRuntimeStateCorePrimary` 现在先同步 legacy local runtime，再从刷新后的本地存储读取。
  - **ISSUE-4 —— 混合数据源警告**：部分 Postgres/部分 legacy local runtime 时 `console.warn` 记录各源来源；`data_source` 正确报告 `mixed-postgres-fallback`。
  - **ISSUE-8 —— evidence 异常被吞没**：`buildDecisionSnapshotFromCorePrimary` 的空 `catch` 块添加 `console.warn`。
  - **BUG-4 —— 镜像队列错误未导致脚本失败**：`flush()` 现在在写入失败时 reject。
  - **BUG-5 —— 主 Postgres 读取可能跑在本地镜像写入前面**：主读取路径现在在查询 Postgres 前 await 待处理的镜像队列。
  - **BUG-6 —— replay-evidence 回退显示过期信号**：终态信号（`EXPIRED`、`INVALIDATED`、`CLOSED`）现已从回退 evidence 排名中排除。
  - **测试**：新增 `postgresFallbackSync.test.ts`（6 测试）、`postgresMirrorConsistency.test.ts`、`evidenceEngine.test.ts` 扩展。

---

## 10.7.0 (2026-03-27)

- 发布类型：**minor**（新功能）

- **Feat：Supabase 业务数据迁移 —— legacy local runtime → Postgres 镜像层。**
  - **迁移工具**：历史业务表批量迁移至 Supabase Postgres，含批量 upsert、进度日志与一致性审计。
  - **写镜像**（`postgresBusinessMirror.ts`）：基于 Proxy 的写拦截器，自动将 20+ legacy local runtime 写操作异步镜像至 Supabase Postgres，含逐表去重队列。`NOVA_DATA_DATABASE_URL` 设置后激活。
  - **Admin 读镜像**（`postgresBusinessRead.ts`）：Admin 面板（System Health、Research Ops、Alpha Lab）优先从 Supabase 读，legacy local runtime 回退。
  - **运行时读取偏好**（`queries.ts`）：API 路由在镜像可用时优先 Supabase 读，减少 EC2/legacy local runtime 依赖。
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
  - 根因：Vercel serverless 每次 cold start 使用空的 `/tmp` legacy local runtime（0 条 OHLCV bars）。`shouldUsePublicDecisionFallback()` 在用户有持仓时无条件返回 `false`。
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
- **Fix P2**：`NOVA_AUTH_DRIVER=postgres` 泄漏进测试环境，添加环境变量 stub 强制使用本地 legacy local runtime。
- 安装缺失的 `pg` 包，解决 14 个测试文件导入失败。
- 测试套件：88/88 文件通过、340/340 测试通过（之前 67/83 有效文件、180/182 测试）。

---

## 10.2.0 (2026-03-24)

- 发布类型：**minor**（新功能）
- **Feat：Postgres 认证存储加固。**
  - 完整 Postgres 认证存储（`auth_users`、`auth_sessions`、`auth_user_roles`、`auth_password_resets`、`auth_user_state_sync`）、session 作用域用户中间件、RBAC 角色系统（ADMIN / OPERATOR / SUPPORT）、密码重置邮件流。
  - `asyncRoute()` 包装所有 async Express 处理器。session 作用域解析：cookie 解析、`RequestWithNovaScope` 中间件、`requireAuthenticatedScope` 守卫。
  - 新增一键迁移认证数据到 Postgres 的历史脚本。
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
- 修复 manual service 500 崩溃：当用户存在于远程认证但不在本地 legacy local runtime 时优雅处理 FK 约束失败。
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
- 拆分部署认证为轻量 Vercel handlers + 持久化 Redis 兼容存储。本地开发保留 legacy local runtime 认证。

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
- 添加 legacy local runtime 认证、session cookie、密码重置和同步用户状态。

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
- 添加本地运行时 API、训练导出脚本、文档和测试时 legacy local runtime worker 隔离。

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

## 10.20.0 (2026-04-01)

- Release type: minor
- Automated version bump via version-manager.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 10.21.0 (2026-04-01)

- Release type: minor
- Automated version bump via version-manager.
- Updated release metadata, build number, About runtime source, and changelog entry.

## 10.21.1 (2026-04-01)

- Release type: patch
- Automated version bump via version-manager.
- Updated release metadata, build number, About runtime source, and changelog entry.

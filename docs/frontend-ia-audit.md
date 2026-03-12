# Frontend IA Audit (Post-Migration)

Date: 2026-03-08
Project: Nova Quant
Scope: 信息架构（IA）与主交互路径重构，目标用户为普通投资者 / 小规模个人投资者。

## 1) 当前前台最大问题
- 主导航入口过多，首屏决策路径被稀释，用户无法在 10 秒内获得“今天该不该动”的结论。
- 页面仍带有研究终端气质：模块多、术语重、证据层前置，动作结论后置。
- “公共信号浏览”权重高于“我的持仓决策”，与真实用户核心需求不匹配。
- AI 入口存在但不够中心化，容易被理解为附加聊天，而不是系统解释器与交互中枢。

## 2) 为什么 8 个底部 tab 是错误方向
- 对小白用户认知负担过高：需要先“选页面”，再“做判断”，路径反了。
- 底部导航应承载主任务，不应承载全部功能目录。
- 多 tab 会制造“到处都重要”的错觉，削弱产品主线和品牌记忆点。
- 操作成本增加：页面切换多、层级不清，导致留存下降。

## 3) 应降级到 More 的模块
- Weekly Review
- Performance
- Safety
- Insights
- Settings
- Advanced
- Data Status

原则：这些能力重要，但不是用户每天进入后的第一决策入口。

## 4) 应融入 Today / Holdings / AI 的内容
- Today：只保留 Daily Brief 主线（结论、动作、风险、1-3 机会）。
- Holdings：承接“我现在手里怎么办”，突出组合风险、集中度、重复暴露和逐仓建议。
- AI：承接解释层与全局中转，回答“为什么”，并能跳转到 Today/Holdings/Weekly/More 二级页。

## 5) 重构后的新 IA
- 底部固定 4 tab：Today / AI / Holdings / More。
- Today：
  - 主判断卡
  - 我的仓位卡
  - 今日机会卡（最多 1-3）
  - Ask AI 卡
- AI：解释中枢 + 预设问题 chips + 结构化回复 + 页面跳转。
- Holdings：持仓录入与组合检查器。
- More：收纳层（Review、System & Proof、Market Context、Preferences）。

## 6) 本次改动优先级
1. P0：底部导航收敛到 4 tab，移除多入口并保持可运行。
2. P0：Today 重构为 Daily Brief，先结论后证据。
3. P0：Holdings 维持为用户价值核心并强化动作建议。
4. P0：AI 改为解释中枢（非空聊天页），可联动核心页面。
5. P1：More 收纳二级能力并分组清晰。
6. P1：接入 Daily Check-in + Discipline Streak（不鼓励交易频率）。
7. P1：统一文案、状态标签、空状态与过渡状态。

## 7) 本次重构验收标准（IA层）
- 用户首次打开 10 秒内得到可执行结论。
- 主导航稳定为 4 个按钮且职责清晰。
- 非主流程能力不再抢首页与底部主入口。
- AI 成为品牌锚点与解释中枢，不再是孤立聊天框。
- 系统仍复用真实底层输出（market/risk/portfolio/paper/diagnostics）。

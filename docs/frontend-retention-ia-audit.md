# Frontend Retention IA Audit

Date: 2026-03-08
Project: Nova Quant
Focus: 把前台从“功能展示”重构为“每日判断校准与纪律养成产品”。

## 1. 当前前台为什么不够极简
- 尽管主导航已收敛为 4 个 tab，但首页仍存在较多并行信息，不够“单任务”。
- 部分页面仍保留研究系统叙事，用户需要理解很多上下文才能行动。
- 关键路径中仍混有“查看信息”动作，而不是“完成一次判断”。

## 2. 当前前台为什么不够像每日 check-in 产品
- 今日首页缺少明确的“签到-完成”心智锚点（日期、状态、完成感反馈）。
- 连续性指标（streak、weekly rhythm）存在，但没有形成明确的行为仪式。
- 页面反馈更偏系统状态，而不是用户行为完成状态。

## 3. 当前结构为什么容易像竞品式专业终端
- 证据层内容在多处仍然较重，容易让用户先看细节后做判断。
- 持仓页指标密度偏高，接近“分析面板”而非“持仓顾问”。
- Weekly/Performance/Safety 的呈现仍偏“研究输出”，弱化消费级节奏。

## 4. 为什么 8 个 tab 是错误方向
- 对普通用户来说，底部 tab 是“主任务入口”而非“功能目录”。
- 多 tab 会分散注意力，使“今天该不该动”不再是默认动作。
- 复杂能力外露会抬高上手门槛，降低日常回访率。

## 5. 必须留在主流程的内容
- Today 的 Daily Check-in 与 Today’s Call（结论/动作/边界）。
- AI 的解释能力与全局跳转能力。
- Holdings 的个人仓位风险与一句最重要建议。

## 6. 必须降级到 More 的内容
- Weekly Review（主入口可引导，但主页面放 More）。
- Performance / Safety / Insights / Data Status。
- Mode / Settings / Advanced / Research。

## 7. 当前最影响留存与 daily habit 的问题
- 首页未形成强“完成感闭环”：打开后不知道“我完成了吗”。
- AI 虽可用，但缺少分组提问与上下文引导，用户不知道从哪问起。
- Holdings 的信息噪音偏高，用户难以快速拿到 1 句可执行建议。

## 8. 新 IA（information architecture）
- 主导航固定：Today / AI / Holdings / More。
- Today：
  - Daily Check-in（签到状态 + streak）
  - Hero: Today’s Call
  - My Position Today
  - Today’s Opportunities (1-3)
  - Ask Nova
  - Completion Feedback
- AI：
  - 定位区 + 当前上下文
  - 分组预设问题（Today/Holdings/Opportunities/Weekly）
  - 结构化回答（结论/理由/动作/下一步）
  - 轻量历史提问
- Holdings：
  - Portfolio Health Hero
  - Biggest Issues (1-3)
  - One Clear Recommendation
  - Simplified holdings list + Ask AI
- More：
  - Review
  - System & Proof
  - Market Context
  - Preferences

## 9. 执行优先级
1. P0：Today check-in 仪式与 Hero 结论卡强化。
2. P0：AI 中枢改为分组问题 + 结构化回答 + 下一步跳转。
3. P0：Holdings 精简为“问题-建议-动作”主线。
4. P1：Weekly Review 重写为“周度奖励机制”。
5. P1：More 分组与文案统一。
6. P1：状态、badge、空状态、收尾反馈统一。

## 10. 本次如何强化“高留存 / 高 AI 感 / 强判断仪式感”
- 高留存：把每日主任务收敛为一次 check-in，并用 streak/weekly rhythm 提供连续感。
- 高 AI 感：AI 不做孤立聊天，做解释中枢与跳转中枢，首页和 AI 页都给显著入口。
- 强判断仪式感：先结论、再动作、再解释；页面底部给“今日已完成”反馈，形成闭环。
- 风险边界导向：奖励纪律与复盘，而不是奖励交易次数。

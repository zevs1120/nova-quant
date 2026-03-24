# Nova Quant Frontend Audit

Last updated: 2026-03-08 (Asia/Shanghai)

## Scope

Post-migration frontend review for consumer-facing usability: daily decision speed, personal portfolio relevance, explainability, and habit-forming weekly cadence.

## Audit Findings

### 1) 首页是否信息过载或结论不清

- Status: `partial`
- Current:
  - `Today` 已有 Daily Brief，但仍混入较多执行与研究块（尤其 Standard 模式）。
  - 首页结论可见，但“下一步动作”不够强，空机会日的“不要硬做”提示不够显眼。
- Impact:
  - 普通用户 10 秒内可读性仍不稳定。

### 2) Today / Performance / Safety / Insights / AI 职责边界

- Status: `partial`
- Current:
  - Today、Safety、Insights 都在解释风险与 regime，边界存在重复。
  - Performance 仍有较高视觉优先级，可能压过 Today/My Holdings。
- Impact:
  - 用户不知道该先看哪里，日常打开路径不够清晰。

### 3) 是否仍然过像“专业终端”

- Status: `yes`
- Current:
  - Insights 页仍带 dashboard surface / overlay 表达，偏专业终端风格。
  - 术语密度在部分页面偏高（regime/funnel/alpha 等）。
- Impact:
  - 新手心理负担高，降低日常复访意愿。

### 4) 是否缺少真正的用户对象（My Holdings）

- Status: `good_base`
- Current:
  - 已有 Holdings 页面与本地持仓分析，是迁徙后强项。
  - 但持仓输入缺少“信心程度”等个体化字段，主建议呈现可再收敛为“一句话最重要动作”。
- Impact:
  - 已具备价值，但还可更“像我的工具”。

### 5) 是否缺少模式分层（Beginner/Standard/Advanced）

- Status: `partial`
- Current:
  - 已有模式切换与可见 tab 差异。
  - 但同页信息密度差异还不够大，Beginner 的“更强解释/更强边界”不够彻底。
- Impact:
  - 模式标签存在，但用户感知差异不够明显。

### 6) 是否解释层太弱

- Status: `partial`
- Current:
  - Today 与 Holdings 有部分 Why 解释块，AI 也支持问答。
  - 缺少统一 Why 入口，且“为什么轻仓 / 为什么 A 级 / 为什么过滤 / 为什么持仓风险高”没有一站式结构。
- Impact:
  - 黑盒感仍存在，解释入口分散。

### 7) 是否留存机制不足（周报/复盘）

- Status: `good_base_with_gap`
- Current:
  - 已有 Weekly Review 页面，方向正确。
  - 但与“下周重点 + 用户行为边界”的绑定还可更强，复访理由还可更明确。
- Impact:
  - 每周复盘可用，但习惯养成钩子不足。

### 8) 迁徙后视觉/间距/状态/命名/badge 统一性

- Status: `partial`
- Current:
  - 大部分卡片与状态风格统一。
  - 仍有命名与状态文案不一致（Today/Signals 混用；部分 badge 语义偏技术化）。
  - Insights 页视觉语言与其他页不完全一致。
- Impact:
  - 品牌感和“冷静副驾驶”一致性被削弱。

### 9) 最影响“每天会不会打开”的问题

- 优先级最高问题:
  1. Today 的“结论->动作->边界”仍可更短更硬。
  2. 缺少集中式 Why 页面，解释路径分散。
  3. My Holdings 还未把“我的信心/持仓意图”纳入判断。
  4. 模式分层不够明显，Beginner 仍偏复杂。

### 10) 本次几小时内最值得优先重构

- P0:
  1. 重构 Today：强化 10 秒结论与“今天不要硬做”的显式状态。
  2. 强化 My Holdings：加入持仓信心字段 + 更直接的一句话建议。
  3. 新增 Why 页面：统一解释入口，覆盖关键五问。
- P1:
  1. 深化 Beginner/Standard/Advanced 的信息层级差异。
  2. 强化 Weekly Review 的留存文案与行为边界。
  3. 统一状态/badge/文案命名。
- P2:
  1. 后续再做更深层的视觉系统抽象与组件统一。

## This Cycle Refactor Checklist

1. Today 只保留“结论优先 + 1-3 机会 + 风险边界”。
2. Holdings 增加 `confidence_level` 输入并纳入分析。
3. 新增 Why 入口页，聚合关键解释对象。
4. 三模式下同页密度明显不同（尤其 Beginner）。
5. Weekly Review 更清晰回答“这周怎样/下周看什么/该避免什么”。
6. 文案统一为人话、克制、可执行。

# System Speed Slimming Plan

## 目标

这不是一次“代码洁癖式重构”，而是一轮直接服务于以下结果的瘦身工程：

- 更快的首屏可读时间
- 更少的前端首轮请求扇出
- 更低的服务端热路径抖动
- 更小的页面级样式与组件负担
- 更快的开发理解速度与更低的回归成本

建议把这项工作拆成 **测量先行、前端瘦身、服务端热路径收束、样式与大文件治理** 四个阶段，而不是一次性“大重构”。

## 现状判断

当前仓库已经做过一部分性能友好设计，比如：

- `App` 主壳对核心 Tab 和常用浮层保持 `React.lazy`，见 [src/App.jsx](src/App.jsx#L1)
- `Browse` 已有预热与本地快照缓存，见 [src/utils/browseWarmup.js](src/utils/browseWarmup.js#L1)
- 服务端存在前端读缓存与 inflight 合并，见 [src/server/api/queries.ts](src/server/api/queries.ts#L579)
- `Today` 公共决策已有独立公共缓存，见 [src/server/public/todayDecisionService.ts](src/server/public/todayDecisionService.ts#L674)
- 仓库已经有性能回归测试，见 [tests/performanceOptimization.test.ts](tests/performanceOptimization.test.ts#L1)
- 浏览器侧 `fetchApi` 已接入 [src/shared/http/apiGovernance.js](src/shared/http/apiGovernance.js)（安全读请求并发合并、热点路径最小间隔、失败退避、同源多标签共享冷却状态、Vercel 部署禁用短冷却），降低 **H5 经 `app/` rewrite 打 Edge** 时的无效扇出与故障雪崩重试，同时避免把写请求折叠成共享响应；单测见 [tests/apiGovernance.test.ts](tests/apiGovernance.test.ts)。

但真正影响速度的几个问题仍然很明显：

### 1. 首屏数据加载仍然过于分散

`useAppData` 现在的主路径是：

1. 先请求 `/api/runtime-state`
2. 再并发请求 `/api/assets`、`/api/evidence/signals/top`、`/api/market-state`、`/api/performance`、`/api/market/modules`、`/api/risk-profile`
3. 登录态下再补 broker / exchange 连接状态
4. 最后单独再打一轮 `/api/signals`

对应代码见 [src/hooks/useAppData.js](src/hooks/useAppData.js#L52)。

这意味着：

- 首次进入主壳时，请求扇出偏大
- 某些信息明显属于同一个 runtime 视图，却拆成多次补丁式获取
- 前端合并状态逻辑复杂，增加渲染和维护成本

### 2. 超大文件已经开始拖慢“读代码速度”和改动安全性

目前几个明显热点：

- [src/server/api/queries.ts](src/server/api/queries.ts) 约 6249 行
- [src/server/db/repository.ts](src/server/db/repository.ts) 约 3830 行
- [src/server/db/postgresRuntimeRepository.ts](src/server/db/postgresRuntimeRepository.ts) 约 3361 行
- [src/server/admin/postgresBusinessRead.ts](src/server/admin/postgresBusinessRead.ts) 约 3181 行
- [src/server/public/browseService.ts](src/server/public/browseService.ts) 约 2533 行
- [src/components/TodayTab.jsx](src/components/TodayTab.jsx) 约 2760 行
- [src/App.jsx](src/App.jsx) 约 1479 行

这类文件会同时带来两类成本：

- 运行时热路径更难精准治理
- 开发时定位与回归判断更慢

### 3. 重页面 CSS 仍然偏大

样式文件里最明显的是：

- [src/styles/onboarding.css](src/styles/onboarding.css)
- [src/styles/today-final.css](src/styles/today-final.css)
- [src/styles/browse.css](src/styles/browse.css)
- [src/styles/menu.css](src/styles/menu.css)

这并不一定意味着线上一定慢，但会明显增加：

- CSS 解析与覆盖复杂度
- 页面局部改动的风险
- 视觉层回归排查时间

### 4. `queries.ts` 现在承担了过多职责

[src/server/api/queries.ts](src/server/api/queries.ts#L1) 同时承载了：

- 前端读接口主逻辑
- 公共 Today / Browse 转发
- Postgres primary read 与 fallback
- 多类 cache / inflight 去重
- 交易执行、风控、通知、训练、ops、AI 相关查询

这会造成一个典型问题：
同一个文件里既有“高频读请求热路径”，又有“低频管理型逻辑”，导致热路径很难被单独观察、优化和测试。

## 优先级排序

如果目标是“最快看到速度收益”，我建议优先级是：

1. 收缩前端首轮请求扇出
2. 稳定服务端 runtime / browse 热路径
3. 拆开超大聚合文件
4. 缩减页面级 CSS 与无关渲染负担
5. 补性能指标和门禁

也就是说，**先治请求链路，再治代码体积，再治长期维护成本**。

## Phase 1: 测量先行

先补一套非常轻量但长期有用的基线，否则优化会变成凭感觉。

### 建议新增的指标

- `App` 首次进入 `Today` 的请求总数
- `runtime-state` 服务端耗时 p50 / p95
- `browse home`、`browse overview`、`browse chart` 服务端耗时 p50 / p95
- `TodayTab`、`BrowseTab`、`MenuTab` 懒加载 chunk 大小
- 首次切到 `Browse` 的总请求数与总耗时
- 前端缓存命中率
- 服务端 `cachedFrontendRead` 命中率

### 落地方式

- 在 [src/server/observability/spine.ts](src/server/observability/spine.ts) 补最基础的耗时与 cache hit 埋点
- 在 `useAppData` 和 `browseWarmup` 上做开发态调试统计
- 扩展 [tests/performanceOptimization.test.ts](tests/performanceOptimization.test.ts#L1) 的断言，不只看 chunk 是否拆出，也看首屏接口是否被重新耦合

### 预期收益

- 之后每一轮优化都能量化
- 可以更早发现“结构变好了但实际没快”的假优化

## Phase 2: 前端首轮读取链路收缩

这是最值得先动的一段。

### 2.1 把 `useAppData` 从“多接口补丁模式”改成“主快照 + 按需补充模式”

当前 [src/hooks/useAppData.js](src/hooks/useAppData.js#L103) 在 runtime 数据后还要并发补大量接口。

建议重构目标：

- `/api/runtime-state` 直接返回 Today 主壳真正首屏需要的完整快照
- 前端在首屏只消费一个主接口
- 只有非关键、非首屏、弱一致性数据才延后补充

优先从以下字段开始收口进主快照：

- `risk-profile`
- `market-state`
- `market/modules`
- `signals` 的首页可见子集
- 连接状态摘要

保留异步延后的内容：

- 全量 `signals`
- 细颗粒 performance 明细
- 非首屏证据补充

### 2.2 把“静默刷新”从整包刷新改成分层刷新

现在 `useAppData` 会按固定周期整体静默 refresh，见 [src/hooks/useAppData.js](src/hooks/useAppData.js#L353)。

建议改成：

- 核心 runtime 数据短 TTL
- 次要模块中 TTL
- 弱关键面板长 TTL

这样做能减少：

- 不必要的重复网络请求
- 因整包 setState 导致的额外渲染

### 2.3 明确主壳只为 `Today` 负责

你前面提的方向是对的：除了 `Today` 以外，二级页不该共享重壳级拉取逻辑。

建议后面把 `Browse / My / Menu` 的一部分数据获取从主壳挪走：

- `Browse` 保持进入时 warmup
- `Menu` 只拉自己的 section 数据
- `My` 分页按 section 取数

这样 `App` 就不再像“进入一次把全产品都摸一遍”。

## Phase 3: 服务端热路径收束

### 3.1 把 `queries.ts` 拆成按领域的 read slices

建议优先拆 [src/server/api/queries.ts](src/server/api/queries.ts)：

- `queries/runtimeReads.ts`
- `queries/browseReads.ts`
- `queries/todayReads.ts`
- `queries/portfolioReads.ts`
- `queries/engagementReads.ts`
- `queries/adminReads.ts`
- `queries/opsReads.ts`

`queries.ts` 自己最后只保留：

- 导出拼装
- 极少量共享 cache helpers
- 兼容过渡层

这件事的价值不只是“好看”，而是：

- 热路径代码能独立测量
- 缓存键和 TTL 能按领域治理
- 回归测试能更聚焦

### 3.2 让 runtime-state 真正成为唯一高频入口

[src/server/api/queries.ts](src/server/api/queries.ts#L5454) 现在已经对 `runtime_state` 做缓存，但前端仍然会追打多接口。

建议目标：

- `runtime-state` 成为 Today 主视图唯一高频读接口
- 其余 Today 首页接口只保留给后台或特殊视图
- 前端不再把多个 read endpoint 当拼图自行组装

### 3.3 Browse 热路径做“组合读接口”

当前 `Browse` detail warmup 会并发打：

- `/api/browse/chart`
- `/api/browse/overview`
- `/api/browse/news`

对应代码见 [src/utils/browseWarmup.js](src/utils/browseWarmup.js#L215)。

建议新增一个 detail bundle 接口，例如：

- `/api/browse/detail-bundle`

由服务端组合：

- chart
- overview
- top news
- 轻量 summary

这样可以明显减少：

- 前端 detail 首次打开的瀑布和竞争
- 浏览器连接占用
- 失败重试时的状态拼装复杂度

### 3.4 热路径缓存不要只靠单层 TTL

当前已有 `cachedFrontendRead` 与多个 public cache，这很好，但建议再加一层策略化治理：

- 高频热点接口：短 TTL + inflight 去重
- 公共静态近实时接口：中 TTL + 允许 stale-while-revalidate 语义
- 用户强私有接口：短 TTL + 写后定向失效

其中 [src/server/api/queries.ts](src/server/api/queries.ts#L538) 已经有 `invalidateFrontendReadCacheForUser`，这条路值得继续强化。

## Phase 4: 页面体积与渲染瘦身

### 4.1 拆大组件，先拆 `TodayTab` 和 `App`

优先拆：

- [src/components/TodayTab.jsx](src/components/TodayTab.jsx)
- [src/App.jsx](src/App.jsx)

建议拆法不是“按行数平均切”，而是按渲染责任拆：

- hero / summary / action cards
- evidence / modules / overlays
- top bar / tab frame / routing guards

拆完后要达到两个效果：

- 首屏只挂最少必要子树
- 非当前 tab 的重计算和重样式不再被主壳牵连

### 4.2 为二级页建立统一轻画布

这个和你前面提的 shell 思路一致。

建议最终 UI 结构是：

- `Today` 保留强 shell
- `Browse / Menu / My / Nova` 共享轻量 canvas
- 二级页只保留 module 级容器

这会直接带来：

- 更少重复页面级布局代码
- 更少重复页面级样式 token
- 更低的 tab 切换视觉和渲染成本

### 4.3 CSS 不再按“页面大包”无限堆

建议对以下文件做二轮治理：

- [src/styles/today-final.css](src/styles/today-final.css)
- [src/styles/onboarding.css](src/styles/onboarding.css)
- [src/styles/browse.css](src/styles/browse.css)
- [src/styles/menu.css](src/styles/menu.css)

建议做法：

- 提取共享 surface / module / typography tokens
- 把极少复用的 detail-only 样式就近留在对应页面文件体系
- 删除失效选择器和历史主题残留
- 避免同一语义在多个页面重复定义

目标不是机械追求“CSS 行数变少”，而是让：

- 首屏全局 CSS 变轻
- 二级页样式只在真正进入页面后生效
- 调视觉时不再牵一发动全身

## Phase 5: 数据与接口语义瘦身

### 5.1 Today 和 Browse 都要明确“首屏字段白名单”

很多接口慢，不只是因为请求多，也因为 payload 过宽。

建议给以下接口建立字段白名单：

- `runtime-state`
- `browse home`
- `browse detail bundle`

规则：

- 首屏只返回当前屏可渲染字段
- 大数组、深层 evidence、完整新闻正文只做懒取
- 传输层不要把“以后可能会用到”的字段顺手带上

### 5.2 删掉重复转换和重复派生

当前前端和服务端都存在一定的“同一语义多次 normalize / merge / patch”的迹象。

重点检查：

- `useAppData` 里的多轮 `setData`
- `Browse` detail 的 chart / overview / news 拼装
- `queries.ts` 中 runtime 与 public fallback 的重复对象重组

这是很容易拿到收益的瘦身点，因为它通常不涉及业务规则变化。

## 建议的执行顺序

### Sprint A: 先拿真实速度收益

- 给 `useAppData`、`runtime-state`、`browse detail` 补测量
- 设计 `runtime-state` 首屏字段收口方案
- 设计 `browse detail bundle`
- 降低 Today 首轮请求扇出

### Sprint B: 再拆热路径文件

- 拆 `queries.ts` 的 runtime / browse / today read slices
- 拆 `TodayTab.jsx`
- 精简 `App.jsx` 的页面级职责

### Sprint C: 再做样式和页面结构治理

- 二级页统一轻量 canvas
- Today 保持强舞台
- 清理重页面 CSS 和历史残留样式

## 我最建议先做的 5 件事

如果只做最值得的五项，我会按这个顺序来：

1. 把 [src/hooks/useAppData.js](src/hooks/useAppData.js#L52) 改成真正的“单主快照首屏读取”
2. 给 `Browse` 新增 detail bundle 接口，替代前端同时打 chart / overview / news
3. 把 [src/server/api/queries.ts](src/server/api/queries.ts) 先拆出 runtime reads 和 browse reads
4. 把 [src/components/TodayTab.jsx](src/components/TodayTab.jsx) 拆成按首屏责任划分的子模块
5. 给性能回归测试新增“首轮请求扇出不能反弹”的门禁

## 不建议现在做的事

下面这些事看上去像优化，但当前阶段优先级没那么高：

- 到处加 `useMemo` / `useCallback`
- 为了追求行数少而做大规模语义不清的重命名
- 先全仓迁移 CSS-in-JS 或 Tailwind
- 先做很重的 E2E 性能基建
- 还没量化前就盲目上复杂缓存层

这些动作容易消耗时间，但不一定带来最直接的速度收益。

## 成功标准

这轮瘦身做完后，至少应该看到这些结果：

- Today 首屏请求数明显下降
- Browse detail 首次打开的请求数下降
- `runtime-state` 与 browse 热路径耗时更稳定
- `queries.ts` 不再是单一巨石文件
- 二级页切换更轻，首屏和次级页职责更清楚
- 相关性能断言进入测试门禁

## 结论

可以做，而且很值得做。

如果我们目标是“整个系统读得更快、回得更快、也更容易持续迭代”，最该做的不是抽象层面的大重构，而是：

- 先把首轮读取链路收短
- 再把服务端热路径集中
- 再拆掉超大文件和重样式包

这套顺序会更稳，也更容易在每一轮都拿到真实收益。

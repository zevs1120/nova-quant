# 量化基础词典（Nova Quant 入门版）

这份词典是给量化和 AI 门外汉准备的。

目标不是一次学会全部，而是先建立一张“能听懂团队讨论、能看懂系统流程”的地图。

建议使用方式：

- 先快速通读一遍
- 遇到团队提到某个词，再回来查
- 每学一个词，就去系统里找它对应的位置

---

## 1. K 线 / Bar

一条 bar 就是一段时间内的：

- 开盘价 `open`
- 最高价 `high`
- 最低价 `low`
- 收盘价 `close`
- 成交量 `volume`

它是量化系统最基础的原材料。

在 Nova Quant 里，系统先拿到 bars，再往后计算特征、生成信号。

可对应代码：

- [runtimeDerivation.ts](/Users/qiao/Downloads/nova-quant/src/server/quant/runtimeDerivation.ts)

---

## 2. Feature（特征）

特征就是从原始价格里提炼出来的“更适合分析的中间指标”。

常见例子：

- 均线
- 波动率
- z-score
- ATR
- 成交量变化
- 动量

为什么要有特征：

- 原始价格太杂乱
- 直接看价格不容易稳定判断规律
- 特征更适合后续规则、模型和研究流程使用

在 Nova Quant 里，bars 会先被转成各种特征，再进入 signal 和 decision 流程。

可对应代码：

- [runtimeDerivation.ts](/Users/qiao/Downloads/nova-quant/src/server/quant/runtimeDerivation.ts)

---

## 3. Alpha

alpha 不是“一笔交易”，也不是“一个模型名字”。

更准确地说，alpha 是：

**某类条件下，长期存在一点点可重复优势的规律。**

比如：

- 趋势市场中，回踩后继续上涨的概率略高
- 区间市场中，极端超跌后反弹概率略高

alpha 重要的不是“听起来聪明”，而是：

- 可重复
- 可验证
- 能经受住时间和环境变化

在 Nova Quant 里，alpha 更像研究成果和运行时覆盖层，而不是单条用户建议。

可对应代码：

- [alpha_discovery/index.ts](/Users/qiao/Downloads/nova-quant/src/server/alpha_discovery/index.ts)

---

## 4. Strategy（策略）

策略就是把 alpha 变成一套可执行规则。

通常会包括：

- 什么条件下进场
- 什么条件下出场
- 止损怎么设
- 仓位多大
- 适用于什么市场状态

一句话：

**alpha 是优势想法，strategy 是把这个想法做成操作手册。**

可对应文档：

- [STRATEGY_DISCOVERY_ENGINE.md](/Users/qiao/Downloads/nova-quant/docs/STRATEGY_DISCOVERY_ENGINE.md)

---

## 5. Signal（信号）

signal 是系统判断：

**“这个标的现在出现了一个可能值得关注的机会。”**

它通常会带着这些信息：

- 做多还是做空
- 置信度
- 进场区间
- 止损
- 止盈
- 适用策略家族

一句话：

**signal 是系统内部的机会说明书。**

可对应代码：

- [runtimeDerivation.ts](/Users/qiao/Downloads/nova-quant/src/server/quant/runtimeDerivation.ts)

---

## 6. Regime（市场状态）

regime 就是系统对“当前市场环境”的判断。

例如：

- 趋势市
- 震荡市
- 高波动市
- 风险偏好差的市场

为什么重要：

- 同一个策略，在不同 regime 下效果可能完全不同
- 趋势策略在震荡市可能表现很差
- 均值回归在单边趋势里可能被来回打脸

在 Nova Quant 里，regime 是一等公民，不是装饰标签。

可对应文档：

- [DECISION_ENGINE.md](/Users/qiao/Downloads/nova-quant/docs/DECISION_ENGINE.md)

---

## 7. Backtest（回测）

回测就是：

**拿历史数据模拟“如果过去按这个策略做，会发生什么”。**

它会帮助回答：

- 大概赚不赚钱
- 回撤大不大
- 命中率如何
- 成本后还行不行

但回测不是最终真相，因为：

- 历史不等于未来
- 很容易过拟合
- 真实交易成本和冲击可能更复杂

可对应文档：

- [backtest-engine.md](/Users/qiao/Downloads/nova-quant/docs/backtest-engine.md)

---

## 8. Walk-Forward

walk-forward 是更接近真实研究流程的一种验证方法。

它不是把所有历史一次性吃完再说成绩，而是：

- 用前一段数据研究
- 再去下一段数据验证
- 再往前滚动

它的意义是：

**尽量避免“拿未来信息帮过去做题”。**

可对应文档：

- [STRATEGY_DISCOVERY_ENGINE.md](/Users/qiao/Downloads/nova-quant/docs/STRATEGY_DISCOVERY_ENGINE.md)

---

## 9. Robustness（稳健性）

稳健性就是问：

**这个策略是不是只在一个特别巧的设定下才成立。**

常见检查方式：

- 参数稍微改一点还行不行
- 成本提高一些还行不行
- 市场换个阶段还行不行
- 风格切换后还活不活

稳健性越差，越像过拟合。

可对应文档：

- [STRATEGY_DISCOVERY_ENGINE.md](/Users/qiao/Downloads/nova-quant/docs/STRATEGY_DISCOVERY_ENGINE.md)

---

## 10. Slippage / Transaction Cost（滑点 / 交易成本）

交易成本包括：

- 手续费
- 买卖价差
- 滑点
- 某些市场特有成本，比如 funding/basis

滑点可以理解成：

**你以为能成交在那个价格，实际上通常更差一点。**

如果一个策略“只在不考虑成本时赚钱”，那它往往不是真正可用的 alpha。

可对应代码和文档：

- [signalEngine.js](/Users/qiao/Downloads/nova-quant/src/engines/signalEngine.js)
- [backtest-engine.md](/Users/qiao/Downloads/nova-quant/docs/backtest-engine.md)

---

## 11. Drawdown（回撤）

回撤就是：

**从历史高点往下跌了多少。**

比如账户从 100 跌到 80，回撤就是 20%。

为什么重要：

- 赚钱不难，控制回撤更难
- 用户对连续亏损和大回撤非常敏感
- 很多策略不是死于“不赚钱”，而是死于“扛不住”

---

## 12. Sharpe

Sharpe 是常见的风险调整后收益指标。

可以粗略理解成：

**每承担一份波动，换来了多少收益。**

它不是万能指标，但很常用，因为：

- 单看收益不够
- 收益高但波动也非常大，可能不是真正好策略

在 Nova Quant 里，策略验证时会参考 Sharpe 这类指标。

---

## 13. Position Sizing（仓位管理）

仓位管理回答的问题不是“做不做”，而是：

**做多大。**

同一个 signal：

- 可以重仓
- 可以轻仓
- 可以只观察

仓位通常会受到这些约束：

- 置信度
- 风险档位
- 波动率
- 用户风险偏好
- 整体暴露上限

可对应代码：

- [runtimeDerivation.ts](/Users/qiao/Downloads/nova-quant/src/server/quant/runtimeDerivation.ts)

---

## 14. Turnover（换手）

换手就是策略交易得有多频繁。

换手太高通常意味着：

- 成本更高
- 更难执行
- 更容易看起来回测不错、实盘变差

因此研究里必须看换手，而不是只看收益。

---

## 15. Correlation（相关性）

相关性就是看两个东西是不是总在一起涨跌。

比如两个策略表面不同，但其实常常同涨同跌，那它们可能本质上押的是同一类风险。

为什么重要：

- 你以为自己很分散
- 实际上可能只是重复下注

相关性过高时，新 alpha 的价值会下降。

---

## 16. Diversification（分散化）

分散化就是：

**别把所有风险集中在同一个方向上。**

真正好的新策略，不只是自己能赚钱，还应该：

- 和已有策略互补
- 降低整体组合脆弱性

所以“组合贡献”很重要，不是只看单个策略成绩。

可对应文档：

- [STRATEGY_DISCOVERY_ENGINE.md](/Users/qiao/Downloads/nova-quant/docs/STRATEGY_DISCOVERY_ENGINE.md)

---

## 17. Confidence（置信度）

置信度可以理解成：

**系统当前对这个 signal 有多大把握。**

注意：

- 置信度不是保证
- 不是 80% 就一定会赢
- 它只是当前模型和规则综合后的把握程度表达

在 Nova Quant 里，signal 生成后会带 confidence。

---

## 18. Calibration（校准）

校准就是把模型“自认为的把握”调得更贴近现实。

很多模型的问题不是完全不会判断，而是：

- 过度自信
- 低估风险
- 对不同市场环境不够诚实

校准的作用是：

- 修正置信度
- 调整仓位大小
- 让输出更可信

可对应代码：

- [runtimeDerivation.ts](/Users/qiao/Downloads/nova-quant/src/server/quant/runtimeDerivation.ts)

---

## 19. Shadow（影子运行）

shadow 不是正式上线，而是：

**先观察它在真实新数据中的表现，但先不完全放给用户或真实资金。**

为什么需要 shadow：

- 历史上看着好，不代表未来也好
- 很多策略一进真实环境就开始衰减

因此 shadow 是候选策略到正式晋升之间的重要缓冲层。

可对应文档和代码：

- [STRATEGY_DISCOVERY_ENGINE.md](/Users/qiao/Downloads/nova-quant/docs/STRATEGY_DISCOVERY_ENGINE.md)
- [alpha_discovery/index.ts](/Users/qiao/Downloads/nova-quant/src/server/alpha_discovery/index.ts)

---

## 20. Action Card（行动卡片）

Action Card 是 Nova Quant 里最接近用户的一层对象。

它不是内部研究语言，而是：

**系统最后整理给用户看的行动建议。**

通常会包含：

- 做什么
- 为什么现在
- 风险是什么
- 进场区间
- 止损止盈

最关键的一点：

**signal 不等于 action card。**

signal 只是内部机会说明；
action card 是结合风险、持仓、发布门槛之后，真正给用户看的建议。

可对应文档和代码：

- [DECISION_ENGINE.md](/Users/qiao/Downloads/nova-quant/docs/DECISION_ENGINE.md)
- [engine.ts](/Users/qiao/Downloads/nova-quant/src/server/decision/engine.ts)

---

## 一句话总复习

可以把这 20 个词串成一条线：

`K线/bar -> feature -> signal -> strategy -> alpha -> backtest/walk-forward/robustness -> confidence/calibration -> decision -> action card`

再加上几层现实世界约束：

- regime
- cost/slippage
- drawdown
- position sizing
- correlation/diversification
- shadow

这就是量化系统最核心的入门地图。

---

## 给你的学习建议

最好的学习方式不是背定义，而是按下面节奏：

1. 每天挑 1 到 2 个词
2. 用自己的话复述
3. 去 Nova Quant 代码里找它对应的位置
4. 试着讲给别人听

如果你能把一个词讲清楚给别人听，通常就说明你真的开始懂了。

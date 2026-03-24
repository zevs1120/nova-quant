# Backend Growth Loop (Nova Quant)

Last updated: 2026-03-08 (Asia/Shanghai)

## 目标

把后端研究系统从“能跑出结果”升级为“可持续成长、可治理、可追溯”的闭环。

## 闭环结构（代码真实落点）

1. 数据与训练治理

- 入口: `src/research/multiAssetPipeline.js`
- 输出: `research.multi_asset.dataset_governance`

2. 模型/alpha/strategy 注册体系

- 入口: `src/quant/researchLoop.js`
- 构建器: `src/research/governance/registrySystem.js`
- 输出: `research.registry_system`

3. Champion/Challenger 对比与晋级

- 入口: `src/quant/researchLoop.js`
- 规则与决策: `src/research/governance/promotionLoop.js`
- 输出: `research.comparisons`, `research.promotion_decisions`, `research.governance.promotion_rules`

4. Paper Trading 运营层

- 入口: `src/quant/researchLoop.js`
- 构建器: `src/research/governance/paperOps.js`
- 输出: `research.paper_ops`

5. 系统监控与周复盘

- 构建器: `src/research/governance/internalMonitoring.js`
- 输出: `research.internal_intelligence`, `research.weekly_system_review`

6. 合同校验（可验证）

- 构建器: `src/research/governance/contracts.js`
- 输出: `research.contract_checks`

## 阶段治理（统一状态名）

统一枚举定义在 `src/research/governance/taxonomy.js`：

- `draft`
- `testing`
- `paper`
- `candidate`
- `champion`
- `challenger`
- `retired`

## Growth Loop 的运行产物

`runQuantPipeline()` 后的关键对象：

- `state.research.registry_system`
- `state.research.promotion_decisions`
- `state.research.paper_ops`
- `state.research.internal_intelligence`
- `state.research.weekly_system_review`
- `state.research.contract_checks`

## 一键验证

```bash
npm run snapshot:backend-governance
```

产物：`data/snapshots/backend-governance.sample.json`

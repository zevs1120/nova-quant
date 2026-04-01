# 2026-03-27 Work Summary

## Summary

今天从 commit `c190ad52ae576ecb8c9245866a17091ba73e5b5d` 之后，我们围绕三条主线推进了系统补强：

1. 把运行时和后台逐步切到 `Supabase business mirror`，让数据读取和业务写入更接近真实生产环境。
2. 把公开策略/因子/alpha 供给正式接入 research discovery，开始建立外部 alpha 供给层。
3. 修掉 Today 页可能一张信号卡都没有的问题，补上 runtime 和 evidence 两层的服务端兜底。

本次范围内一共新增 `8` 个 commit，最新提交为 `c1b66a7837053082f158c0214756bf07f6bce24a`。

## Commit Timeline

### 1. `17eb48c9b1061a33d7ba3cb40d516e9d5b9a9dc8`

`fix(admin,app): prefer EC2 API base`

这一笔主要解决环境错连问题。管理后台和主应用优先连接 EC2 API，避免前端实际访问到错误的后端地址，减少部署后“看起来在线、其实不是生产数据”的情况。

### 2. `0cb9b6d930abc12f9e80c8d86f3e60717134f5f4`

`fix(deploy,ops): align EC2 runtime with production`

这一笔把 EC2 运行环境和生产口径重新对齐，包括环境变量、部署文档、自动启动逻辑、Nova client/service 行为。目标是让 EC2 不只是“能跑”，而是尽量像真实线上。

### 3. `99b060e5acf7b3ecbd6cabf4b461dff607dbe9e7`

`feat(db): add Supabase business data migration tooling`

这一笔建立了 business data 向 Supabase 迁移的基础设施，包括：

- 迁移脚本
- 审计脚本
- 迁移模块
- 配套文档
- 回归测试

这意味着我们已经不只是讨论迁移，而是把迁移工具真正做出来了。

### 4. `2b88eda966a7576ac08d04e5a57b2f722a313479`

`feat(admin,control-plane): prefer Supabase read mirror`

这一笔把后台控制台和 control-plane 的读路径优先切到 Supabase mirror。重点影响：

- AlphaLab
- ResearchOps
- SystemHealth
- liveAlpha
- liveOps

结果是后台看到的状态更接近真实线上业务，而不是依赖单机本地库残留状态。

### 5. `66f9fcc6554bdba1a14ccdb178552144c110a110`

`feat(db,ops): mirror backend writes and add platform checks`

这一笔把后端写路径也开始镜像到 Supabase，同时补了平台 readiness 检查和若干运行脚本。到这里，架构开始从“能迁移、能读取”升级为“读写都能同步”。

### 6. `5e77b66b5218caa681826a7f1075e6d142334714`

`feat(api,db): prefer Supabase for live runtime reads`

这一笔把运行态核心 API 读路径逐步切到 Supabase，包括：

- runtime-state
- signals
- connect
- market
- execution 相关读路径

这一步非常关键，因为前台页面展示的数据开始优先依赖业务镜像，而不再主要依赖旧的本地数据库偶然状态。

### 7. `c276c71e091d1d6969f46d91737fa6e406af79d9`

`feat(research,discovery): add public alpha supply intake`

这是今天 research/discovery 侧最重要的一笔，核心完成了四件事：

#### 7.1 建立 runtime feature support matrix

新增了运行时特征支持矩阵，把公开 alpha 需要的特征分成三类：

- `measured`
- `adapter_ready`
- `blocked_missing_data`

这样我们终于能判断一个 public alpha 是不是现在就能用，还是只差一层 adapter，还是底层数据根本没到位。

#### 7.2 把 public seeds 真正接入 discovery

discovery 不再只是内部 seed 自转，而是会把 public hypothesis/template 纳入候选生成、优先级排序和 runtime 支持校验。

#### 7.3 修正 public template alias 问题

此前不少 public family 实际在模板匹配阶段就卡住了。这次补了 alias，对齐后像 `REV / PAIR / CARRY` 这类 public 供给可以真正生成候选，而不是停留在 seed 文件里。

#### 7.4 增加 public alpha supply report 和 research API

新增了公开 alpha 供给报告，能够直接回答这些问题：

- 哪些 public alpha 现在已经能落地
- 哪些只差 adapter
- 哪些被底层数据缺口阻塞

这让“先接一批能用的公开策略/因子/alpha”真正变成了可执行能力。

### 8. `c1b66a7837053082f158c0214756bf07f6bce24a`

`fix(runtime,evidence): backfill signal cards when replay evidence is missing`

这是今天最直接改善前端体验的一笔。

之前 Today 页出现“一张信号卡都没有”的主要原因，不一定是完全没有信号，而是后端两条供给链都可能返回空：

- `runtime-state` 只在非常狭窄的条件下才走 public fallback
- `evidence/signals/top` 在没有 replay/backtest run 时直接返回空数组

这次修复后：

#### 8.1 runtime-state 更积极地兜底

只要当前没有可展示的 signal cards，就允许切到 public decision fallback，而不再死盯着 `DB_BACKED` 这个状态标签。

#### 8.2 evidence/signals/top 不再轻易返回空数组

如果没有 replay evidence，就诚实地退回当前 runtime signals，并明确标记：

- `RUNTIME_SIGNAL_FALLBACK`
- `REPLAY_PENDING`

这意味着前端 Today 页更容易拿到卡片，同时不会虚构“已经有实盘回放证据”。

## What We Achieved Today

今天不是修了几个零散 bug，而是完成了三层补强：

### A. Production Data Backbone

我们把系统从“本地库驱动”往“Supabase business mirror 驱动”推进了一大步。后台读、运行态读、后端写、迁移工具链都在往统一业务数据骨架收拢。

### B. External Alpha Supply

我们不再只是依赖内部很薄的 alpha 发现能力，而是开始把公开 research seed 正式接入 discovery，并且能判断哪些现在可落地、哪些只差 adapter、哪些还被数据卡住。

### C. Signal Card Reliability

我们修复了前端可能完全没有信号卡的问题，让 Today 页在 replay evidence 缺失时依然能拿到可展示信号，先确保产品不会“空白”。

## Validation

本轮相关改动已经通过以下验证：

```bash
npm run typecheck
npm test -- tests/publicAlphaSupply.test.ts tests/strategyDiscoveryEngine.test.ts tests/researchApi.test.ts tests/researchKnowledge.test.ts tests/researchEvaluation.test.ts tests/apiRuntimeState.test.ts tests/evidenceEngine.test.ts tests/evidenceApi.test.ts
```

验证结果：

- `typecheck` 通过
- `8` 个测试文件通过
- `25` 个测试全部通过

## Final State

到今天结束时，系统状态可以概括成一句话：

我们已经把 Nova 从“研究框架在，但真实供给薄、运行态易空白”的状态，推进到了“生产数据骨架更稳、公开 alpha 供给已接入、前端信号卡不再轻易归零”的阶段。

---

Generated at: `2026-03-27 01:35:44 CST`
Base commit: `c190ad52ae576ecb8c9245866a17091ba73e5b5d`
Latest commit: `c1b66a7837053082f158c0214756bf07f6bce24a`

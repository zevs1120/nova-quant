# Commit Summary Since `3e82f1ae52bd503aa270ba58f1329e8418c43bfe`

起点 commit 是 `3e82f1ae52bd503aa270ba58f1329e8418c43bfe`。  
下面只统计它之后的 commit。  
当前一共整理出 `5` 个 commit。

## 1. `c6e998685157c7b1858c7f71a5c05d2e85cb1ace`

`fix(landing): tighten mobile layout and pricing touch behavior`

- 我们先修了落地页的手机端排版。
- 重点处理了价格区的触摸行为、间距、卡片布局和法律区样式。
- 这一步的目标是让 landing 页面在小屏设备上更稳，不容易乱掉。

## 2. `dfbd6be1e405c6513b03b2eea7b3fe70b936d7a5`

`fix(landing): smooth global motion behavior`

- 这一笔把 landing 页的全局动画重新顺了一遍。
- 我们调整了 viewport motion 逻辑，也统一了 Hero、Ask、Distribution、Proof、Voices、Pricing 这些区块的动效。
- 这一步主要是减少动画突兀感，让页面滚动和进入动画更自然。

## 3. `b58a99e80dd4784d59366adbeb3902ed0e2f72f6`

`fix(landing): stabilize statement cards and legal footer`

- 这一笔继续收尾 landing 页。
- 我们稳定了 statement 卡片的排布和交互，也修了 legal footer 的布局问题。
- 这一步主要是把页面里容易抖动和容易错位的部分压稳。

## 4. `eec3899957fef6d68ff1f9a93714997e1baea95f`

`feat(onboarding): rebuild intro poster scenes`

- 这一笔把 onboarding 的开场引导重做了。
- 主要改了 [OnboardingFlow.jsx](/Users/qiao/Downloads/nova-quant/src/components/OnboardingFlow.jsx) 和 [onboarding.css](/Users/qiao/Downloads/nova-quant/src/styles/onboarding.css)。
- 结果是首屏海报式引导、视觉层次和进入流程都更完整了。

## 5. `560eb44b4dc17f6a9a5c5e720323b97eb57377c8`

`feat(nova,risk,db,deploy): add production pack and robustness tooling`

- 这一笔开始把重点从 landing 转到 NovaQuant 主系统。
- 我们新增了生产策略包生成器和鲁棒性训练器，方便直接产出可审计的策略结果。
- 我们把策略包和训练结果接到了 API、查询层和命令行入口，便于本地和云端统一跑。
- 我们增强了组合层的夏普优化、风险预算、回撤控制和风险闸门。
- 我们补了 Supabase 业务数据审计脚本、EC2 环境模板和部署说明，让云端迁移更可执行。
- 我们补了生产策略包、鲁棒性训练、Sharpe 提升、回撤控制相关测试，减少回归风险。

## 总结

这一段时间的工作可以分成两段：

- 前半段主要在修 landing 和 onboarding，目标是把对外页面的移动端、动画和引导体验打磨稳定。
- 最后一笔开始明显转向 NovaQuant 核心能力，重点是策略生成、风控、鲁棒性训练、Supabase 迁移和 EC2 部署准备。

如果用一句简单的话概括，这几笔 commit 做的事情就是：  
先把前台展示层做稳，再把 NovaQuant 后台策略系统、风控系统和云端部署链路补起来。

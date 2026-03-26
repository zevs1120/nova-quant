# NovaQuant 今日改动汇总

日期：2026-03-26  
范围：Landing Page、移动端体验、域名架构、部署入口、视觉细节修正

## 今日提交概览

| 时间  | Commit    | 标题                                                          |
| ----- | --------- | ------------------------------------------------------------- |
| 02:24 | `44c0e60` | `feat(landing): build art-directed mobile-first landing page` |
| 02:34 | `3fa72e4` | `chore(domains): move app entrypoint to app subdomain`        |
| 02:50 | `3dd00ea` | `fix(landing): refine header glass corners`                   |

---

## 一、Landing Page 品牌化重构

对应提交：`44c0e60`

### 具体做了什么

- 新建并完善 `landing/` 作为独立落地页工程。
- 引入 NovaQuant 自有视觉素材，包括：
  - 产品截图
  - 新 logo 资产
  - Ask Nova 页面素材
- 重新组织 landing 的信息架构，完成从首屏到尾页的完整叙事，包括：
  - Hero 首屏
  - 品牌宣言页
  - `Marvix` 架构页
  - `Ask Nova` 页
  - Pricing 页
  - FAQ 页
  - Voices / reactions 页
  - Distribution 页
  - Legal disclosure 页
- 统一了整套视觉语言：
  - contemporary pop art
  - editorial / fashion-magazine 式排版
  - NovaQuant 配色体系
  - liquid glass 组件语言
- 把页面从桌面思维改成真正适配移动端的 landing，重点优化了：
  - 首屏比例
  - 卡片层叠阅读方式
  - pricing 卡带
  - FAQ 阅读密度
  - 底部内容节奏

### 起到了什么效果

- 落地页不再像常规 fintech / SaaS / trading 工具主页，而更像一个有品牌判断力的产品入口。
- NovaQuant 的产品调性被拉开了与竞品的差异，不再显得像“量化工具模板站”。
- 用户在手机上浏览时，页面节奏、字号、卡片层级和 CTA 更自然，体验更接近真正的移动产品品牌页。
- 视觉系统已经形成统一语言，后续新增 section 时不需要从头找风格。

### 对项目的帮助

- 为 NovaQuant 建立了第一版清晰、可传播、可持续迭代的品牌落地页。
- 给后续投放、品牌合作、产品发布、对外介绍提供了正式承接页。
- 为产品和品牌叙事分层打下基础，避免“应用首页同时承担营销页任务”的混乱。
- 为后续 A/B 测试、文案优化、定价展示、转化链路调整提供了一个稳定基底。

---

## 二、域名与入口架构调整

对应提交：`3fa72e4`

### 具体做了什么

- 把“产品主入口”从根域 `novaquant.cloud` 调整为 `app.novaquant.cloud`。
- 保留 `novaquant.cloud` 作为 landing 主域的方向。
- 更新了以下内容：
  - landing 中所有主要 CTA 的目标地址
  - 后端默认 `NOVA_APP_URL`
  - 后端默认 `NOVA_APP_ALLOWED_ORIGINS`
  - 邀请链接生成逻辑
  - README / 部署文档 / 架构文档 / 环境变量示例
  - 对应测试用例
- 同时保留了根域 `novaquant.cloud` 在默认 CORS 白名单里，作为迁移期兼容入口，避免切换当天直接断流。

### 起到了什么效果

- 品牌首页和产品应用终于完成职责分离：
  - `novaquant.cloud` 负责品牌与转化
  - `app.novaquant.cloud` 负责真实产品体验
- landing 页上的 `sign up`、`Get started`、`Open NovaQuant` 等按钮具备了更清晰的跳转语义。
- password reset、signup welcome、invite 链接等关键用户链路开始对齐新的产品入口。

### 对项目的帮助

- 明确了域名架构，减少了“根域既是营销页又是产品页”的长期混乱。
- 提高了后续品牌建设、SEO、投放承接和产品入口管理的可维护性。
- 为未来继续拆分 `landing / app / admin / api` 的部署体系创造了更清晰的边界。
- 让 onboarding、注册、邀请、邮件回跳等行为都能进入正确的产品上下文。

---

## 三、关键视觉细节收尾

对应提交：`3dd00ea`

### 具体做了什么

- 修复顶部栏 liquid glass 的边角裁切问题。
- 调整了 header 玻璃层的：
  - 圆角裁切
  - 背景裁切方式
  - 高光范围
  - 边缘晕染收口

### 起到了什么效果

- 顶部栏两端的玻璃边角更加干净，不再出现“边角没收进去”或“像方块溢出”的观感。
- 顶栏整体更高级，更接近一体化的浅色液态玻璃，而不是叠了几层效果的普通导航条。

### 对项目的帮助

- 解决了最影响第一印象的一个视觉细节问题。
- 提升了页面精致度和产品完成度。
- 让 landing 在截图、录屏、真机展示时更稳定，也更适合作为对外展示材料。

---

## 四、今天形成的阶段性成果

### 已经完成的结果

- NovaQuant 拥有了独立的品牌 landing page。
- Landing 已经具备移动端优先的展示能力。
- 产品主入口切换到了 `app.novaquant.cloud` 的架构方向。
- 品牌页与产品页的角色开始被明确区分。
- 视觉语言已经形成：
  - pop editorial
  - liquid glass
  - NovaQuant 自有配色
  - 移动端优先的内容节奏

### 当前对业务的意义

- 可以开始把 `novaquant.cloud` 当成正式品牌门面来经营。
- 可以更清晰地承接用户从品牌认知到产品进入的路径。
- 未来无论是继续做投放、SEO、媒体露出、Demo 分享还是邀请码传播，都更容易控制入口和路径。

---

## 五、验证情况

今天已经完成并通过的验证包括：

- `node ./node_modules/vite/bin/vite.js build --config landing/vite.config.js`
- `npx vitest run tests/apiCors.test.ts tests/apiIndexRoute.test.ts tests/passwordResetApi.test.ts tests/signupWelcomeApi.test.ts`

说明：

- landing 构建通过
- 域名切换后的 CORS、邮件回跳、欢迎邮件、API 入口测试通过

---

## 六、建议的下一步

### 1. 完成线上域名切换

- `novaquant.cloud` 指向 landing
- `app.novaquant.cloud` 指向 app
- `api.novaquant.cloud` 指向 API
- `admin.novaquant.cloud` 指向 admin

### 2. 真机继续抠移动端细节

建议优先继续优化：

- 首屏构图
- 行动卡横滑手感
- Pricing 卡片在 iPhone 上的高度与节奏
- 顶栏在不同安全区设备上的边距表现

### 3. 准备下一轮增长素材

- 更正式的 slogan / headline 版本
- 更真实的用户评价替换 voices 占位内容
- 定价页更明确的产品层级说明

---

## 七、总结

今天的工作，本质上完成了三件关键事情：

1. 把 NovaQuant 的外部形象从“产品界面”升级成了“品牌世界”
2. 把产品入口从根域中剥离出来，建立了更清晰的域名与部署结构
3. 把一批最影响质感和转化的关键视觉与交互细节推进到了可上线状态

这不是简单做了一页 landing，而是在为 NovaQuant 后续的品牌增长、产品承接和部署架构打基础。

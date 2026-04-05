# Frontend Derived State Rules

## 目的

这份规则只管一件事：
**把“UI 派生逻辑”从组件渲染函数里稳定地放到可复用、可测试、可定位的位置。**

目标不是制造抽象，而是减少下面这些维护成本：

- 同一条 UI 规则在多个组件里重复改
- 大组件里混杂渲染、交互、派生判断，读起来很慢
- 小改动只能靠集成测试兜底，没有纯函数护栏

## 放置规则

### 1. App shell 级派生逻辑

跨多个页面、由主壳消费的派生逻辑，放在 `src/app/`：

- `src/app/topBarState.js`
- `src/app/shellLayout.js`
- `src/app/screenRegistry.jsx`

适用场景：

- 顶栏标题 / 返回行为
- 主壳布局模式
- screen registry / shell 分发

### 2. Feature 内局部派生逻辑

只服务单个 feature，但从组件本体里抽出来更合理的逻辑，放在 feature 目录下的 `*State.js`：

- `src/components/today/todayDeckState.js`

适用场景：

- Today deck 组合
- feature 内的 view-model
- 卡片显示顺序 / 裁剪 / fallback 规则

### 3. 组件内保留什么

组件文件本身优先保留：

- JSX 渲染
- 事件处理
- hook 订阅
- 动画 / 手势状态

不应继续堆在组件里的内容：

- 多分支派生标题/标签
- 多来源数组拼装 / fallback 组合
- 共享的页面分发规则

## 命名规则

- 纯派生 helper 优先用 `*State.js`
- 壳层路由/页面分发 helper 优先用 `*Registry.*`
- 导出名优先用 `derive*State` / `build*State` / `render*Registry`

## 新增逻辑时的判断顺序

1. 这条规则是否会被多个组件或多个 screen 共享
2. 这条规则是否值得单独写纯函数测试
3. 如果答案是“会共享”或“值得测”，就不要继续内联在组件里

## 当前约定实例

- App 顶栏派生：`src/app/topBarState.js`
- Secondary shell 派生：`src/app/shellLayout.js`
- Screen 分发：`src/app/screenRegistry.jsx`
- Today deck 派生：`src/components/today/todayDeckState.js`

## 未来扩展

如果后面继续抽前端派生逻辑，优先沿用这套目录：

- shell 级：`src/app/`
- feature 级：`src/<feature>/.../*State.js`

不要新开第三种无约束位置，除非有非常明确的边界原因。

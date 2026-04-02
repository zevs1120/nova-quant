# Admin Qlib Bridge 健康状态契约

本文档说明 Admin 总览页与系统健康页使用的 Qlib Bridge 状态字段，以及 headline 快路径的性能边界。

## 状态语义

Admin 相关接口统一使用 `qlib_bridge_state` 表达 Bridge 状态：

- `disabled`: 未启用 Qlib Bridge。
- `offline`: 已启用，但 `/api/status` 未返回 `status: "running"`。
- `data_not_ready`: Bridge 进程在线，但 `qlib_ready !== true`，说明 Qlib 数据尚未初始化完成。
- `online`: Bridge 在线，且 Qlib 数据已初始化完成。

兼容字段仍然保留：

- `qlib_bridge_enabled`: Bridge 开关是否开启。
- `qlib_bridge_healthy`: 仅表示 Bridge 进程是否在线响应。
- `qlib_bridge_ready`: 仅表示 Qlib 数据是否完成初始化。
- `qlib_bridge_version`: Bridge 版本号。

约定上：

- `healthy=true` 不再等同于 “Qlib 可直接用于因子与模型推理”。
- 是否真正可用应优先判断 `qlib_bridge_state === "online"`。

## 接口行为

### `/api/admin/system`

系统健康页使用完整状态：

- 总是先请求 Qlib Bridge `/api/status`。
- 只有当 Bridge 进程在线时，才继续请求 `/api/factors/sets` 和 `/api/models`。
- 返回 `qlib_bridge` 对象，包含 `state`、基础运行信息、因子集列表和模型列表。

### `/api/admin/overview/headline`

总览首屏使用轻量状态：

- 只请求 Qlib Bridge `/api/status`。
- 不请求 `/api/factors/sets` 和 `/api/models`。
- 使用更短 timeout，并带短 TTL 内存缓存，避免总览首屏被远端 sidecar 慢请求拖住。
- `headline_metrics` 和 `system_cards` 都会返回 `qlib_bridge_state` / `qlib_bridge_ready` 等字段，供渐进式加载直接消费。

## 前端消费规则

- `OverviewPage` 只根据 `qlib_bridge_state` 渲染 Qlib 状态文案和 priority item。
- `SystemHealthPage` 直接显示四态 pill，并继续展示因子集 / 模型面板。
- 健康页告警不再前端手工重复拼接 Qlib 项，而是完全依赖后端 `diagnostics`。

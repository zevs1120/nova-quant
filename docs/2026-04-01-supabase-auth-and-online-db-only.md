# 2026-04-01 Supabase Auth And Online DB Only

## 背景

这一轮主要解决两个用户可见问题：

- 新邮箱注册时前端会误报 `Supabase Auth 还没有配置完成`
- 某些浏览器会被旧的本地登录态污染，看起来像“注册后直接进入系统”

同时，部署与 sidecar 文档里仍然保留了旧的本地数据库路径说明，容易把运行时重新接回线下数据库。

## 本次改动

### 1. 注册 / 验证链路

- `src/hooks/useAuth.js`
  - 注册与重发验证不再依赖本地瞬时 `hasSupabaseAuthBrowserConfig()` 判断。
  - 改为总是先通过 `ensureSupabaseBrowserClient()` / `signUpWithSupabaseEmailVerification()` 拉取运行时配置后再执行。
  - 注册开始前主动清空主 Supabase client 会话，避免旧账号 session 干扰。
- `src/utils/supabaseAuth.js`
  - 保留 build-time public config 注入与 runtime provider-config 拉取双保险。
  - runtime config 拉取使用 `credentials: 'omit'`，降低跨域 provider-config 读取失败概率。

### 2. 伪登录态移除

- `src/hooks/useAuth.js`
  - 浏览器端不再持久化 `nova-quant-auth-session`。
  - 启动时会清理遗留的本地 auth-session key。
  - 应用以后只认 Supabase session 与服务端 Bearer token 校验。

### 3. 线上数据库唯一来源

- `qlib-bridge/bridge/data_sync.py`
  - Qlib sidecar 改为直接从 Supabase/Postgres 读取 `novaquant_data.assets` 与 `novaquant_data.ohlcv`。
- `qlib-bridge/bridge/config.py`
  - 配置从 `QLIB_BRIDGE_NOVA_QUANT_DB` 改为 `QLIB_BRIDGE_NOVA_QUANT_DATABASE_URL`。
- `qlib-bridge/pyproject.toml`
  - 增加 Postgres 连接依赖 `psycopg[binary]`。
- 部署模板与 README
  - 删除/替换所有旧的本地数据库路径指引。
  - 文案统一为 Supabase/Postgres 是唯一支持的 auth/business data runtime。

## 验证

已通过：

- `npm run format:check`
- `npm run typecheck`
- `npm run verify`

`npm run verify` 结果：

- `133` 个 test files 全通过
- `882` 个 tests 全通过
- root / landing / admin build 全通过

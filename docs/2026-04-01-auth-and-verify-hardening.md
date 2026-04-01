# 2026-04-01 Auth And Verify Hardening

## Scope

这一轮收口的目标不是加新 feature，而是把注册、鉴权和提交前校验真正打磨到可上线、可持续维护的状态：

- 注册必须严格走 Supabase 邮箱验证，不允许“新用户未验证直接进系统”。
- 老的本地公共注册 / 忘记密码 API 既然已经废弃，测试就不能再继续假设它们可用。
- `npm run verify` 和 pre-commit 依赖的测试运行时必须稳定、可重复，不能被真实 Postgres mirror 或环境噪音干扰。

## Auth Flow

- `src/utils/supabaseAuth.js` 新增隔离的 browser client，用于 signup / resend verification。
- 这个 client 禁用了 session persistence、auto refresh 和 URL session 检测，避免注册动作污染主登录态。
- `src/hooks/useAuth.js` 现在把“注册成功”明确区分成 `pendingConfirmation` 状态；如果 Supabase 返回了即时 session，会被视为配置错误。
- `src/components/OnboardingFlow.jsx` 新增 verify 模式，注册后只展示等待验证说明和 resend 按钮，不再自动切回普通登录态。

## Test Runtime

- Vitest 通过 `tests/vitest.setup.ts` 默认使用隔离 sqlite runtime，并关闭 Postgres mirror writes。
- 需要真实 Postgres 语义的测试会显式打开 `NOVA_DATA_RUNTIME_DRIVER=postgres` 或 `NOVA_ENABLE_PG_MIRROR_WRITES_TEST=1`。
- 这样做的目的不是回退产品架构，而是让测试保持 hermetic：默认不依赖真实 Supabase 网络，也不会把 mirror 副作用带进无关测试。

## Test Updates

- `tests/passwordResetApi.test.ts` 和 `tests/signupWelcomeApi.test.ts` 改为验证 `AUTH_MANAGED_BY_SUPABASE`，与当前产品契约一致。
- `tests/adminAuthApi.test.ts`、`tests/adminDataApi.test.ts` 不再调用废弃的 signup handler，而是直接通过 auth service seed 用户，再验证 admin 登录和数据读取。
- `tests/authScopeApi.test.ts` 改为直接验证 request scope 解析与 `requireAuthenticatedScope`，不再依赖旧 cookie signup 流。
- `tests/postgresFallbackSync.test.ts`、`tests/postgresMirrorConsistency.test.ts` 更新到新的 runtime bundle / mirror 行为。

## Outcome

- `npm run verify` 已经能够完整通过：
  - lint
  - prettier check
  - typecheck
  - 881 个测试
  - root build
  - landing build
  - admin build

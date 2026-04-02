# 积分体系与 Prediction Game（manual 模块）

本文档描述业务库中与 **积分、VIP 天兑换、邀请分阶段奖励、签到、每日 engagement、预测市场** 相关的实现与运维要点。实现入口：`src/server/manual/service.ts`；HTTP 路由：`src/server/api/routes/manual.ts`；管理端结算：`POST /api/admin/manual/predictions/settle`（需 admin session）。

## 价值锚点与数据表

- **1000 积分 = 1 天 VIP**（兑换走 `VIP_REDEEM` ledger，并增加 `manual_user_state.vip_days_balance`）。
- 核心表（定义见 `src/server/db/schema.ts`）：
  - `manual_user_state` — 邀请码、`vip_days_*`、签到 streak 字段
  - `manual_points_ledger` — 积分流水（`balance_after` 为运行余额）；每日 engagement 使用固定 `event_type = ENGAGEMENT_SIGNAL`（按日幂等由 `manual_engagement_daily` 保证）
  - `manual_referrals` — 邀请关系与阶段状态
  - `manual_prediction_markets` / `manual_prediction_entries` — 预测题目与用户选择
  - `manual_checkins` — 按 UTC 日 `day_key` 的签到记录
  - `manual_main_prediction_daily` — 每用户每 UTC 日 `MAIN` 场参与次数（与限次、Dashboard `mainPredictionsToday` 同源，避免竞态下超发）
  - `manual_engagement_daily` — 每用户每 UTC 日 engagement 是否已发放（与 ledger 配合）

**已有生产库**若在建表之后创建，需自行执行与 schema 一致的 `ALTER` / 迁移（仓库内 `CREATE TABLE IF NOT EXISTS` 不会为旧表补列）。

## 规则摘要（默认值可通过环境变量覆盖）

| 能力            | 默认行为                                                                                                  | 主要环境变量                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 注册赠分        | 300（幂等 `SIGNUP_BONUS`）                                                                                | `NOVA_MANUAL_SIGNUP_BONUS_POINTS`, `NOVA_MANUAL_DISABLE_SIGNUP_BONUS`                          |
| Onboarding      | 700（幂等 `ONBOARDING_BONUS`）；成功后尝试触发邀请阶段二                                                  | `NOVA_MANUAL_ONBOARDING_BONUS_POINTS`                                                          |
| 邀请            | 阶段一各 300；阶段二各 700；完成态计入邀请人**当月**上限                                                  | `NOVA_MANUAL_REFERRAL_STAGE1_POINTS`, `STAGE2`, `NOVA_MANUAL_REFERRAL_MAX_COMPLETED_PER_MONTH` |
| VIP 兑换        | 每自然月最多兑换 **7 天**                                                                                 | `NOVA_MANUAL_VIP_MAX_DAYS_PER_MONTH`, `NOVA_MANUAL_VIP_REDEEM_POINTS`                          |
| 签到            | 每日 20；每满 7 天 +100；满 30 天 +500                                                                    | `NOVA_MANUAL_CHECKIN_*`                                                                        |
| 每日 signal     | 每 UTC 日一次小额奖励（`manual_engagement_daily` + ledger `ENGAGEMENT_SIGNAL`）                           | `NOVA_MANUAL_ENGAGEMENT_SIGNAL_POINTS`                                                         |
| 预测 `STANDARD` | 默认 stake 100；胜方返还 **2× stake**                                                                     | `NOVA_MANUAL_PREDICTION_STAKE_STANDARD`                                                        |
| 预测 `MAIN`     | 固定 stake **1000**；每用户每 UTC 日最多 **2** 场；胜方 ledger 返还默认 **1900**                          | `NOVA_MANUAL_PREDICTION_MAIN_*`, `NOVA_MANUAL_PREDICTION_WIN_RETURN`                           |
| 冷启动返还      | `NOVA_MANUAL_PREDICTION_COLDSTART=1` 或 `NOVA_MANUAL_PREDICTION_COLDSTART_UNTIL_MS` 未过期时使用 **2000** | 同上                                                                                           |

完整占位见根目录 `.env.example` 中 `NOVA_MANUAL_*` 段。

## `market_kind` 与题目元数据

- `manual_prediction_markets.market_kind`：`STANDARD` | `FREE_DAILY` | `MAIN`。
- `FREE_DAILY`：不扣 stake；每用户每 UTC 日仅允许一场免费题；结算胜方默认 +30（可用 `metadata_json.freeRewardPoints` 覆盖）。
- `MAIN`：强制 1000 stake；胜方返还见上（可用 `metadata_json.winReturnPoints` 单题覆盖）。
- `metadata_json` 可选字段示例：`{ "winReturnPoints": 1900, "freeRewardPoints": 30 }`。

## HTTP API（用户侧）

**鉴权：** 除 `GET /api/manual/state` 外，下列 `POST` 均需**已登录会话**（Bearer 或 `novaquant_session`）。服务端只认 `resolveRequestNovaScope` 解析出的 `userId`，**请勿在 body 中传 `userId` 冒充他人**（与 `USER_SCOPE_MISMATCH` / `AUTH_REQUIRED` 策略一致）。

| 方法 | 路径                                    | 说明                                                                                                                                  |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| GET  | `/api/manual/state`                     | Dashboard：余额、规则快照、预测列表等（`userId` 来自会话；未登录时在测试环境可能受 query 影响 guest scope，生产应依赖 cookie/Bearer） |
| POST | `/api/manual/rewards/redeem`            | VIP 天兑换（body：`days?`）                                                                                                           |
| POST | `/api/manual/referrals/claim`           | 填写邀请码（阶段一）（body：`inviteCode`）                                                                                            |
| POST | `/api/manual/referrals/complete-stage2` | 仅阶段二（一般可由 onboarding 接口顺带触发）；并发下以 `UPDATE … WHERE status='PARTIAL' RETURNING` 幂等                               |
| POST | `/api/manual/bonuses/onboarding`        | Onboarding 完成赠分 + 尝试阶段二；响应含 `referralStage2`: `{ status: 'granted' }` 或 `{ status: 'skipped', reason }`                 |
| POST | `/api/manual/checkin`                   | 每日签到                                                                                                                              |
| POST | `/api/manual/engagement/signal`         | 当日 signal 互动赠分                                                                                                                  |
| POST | `/api/manual/predictions/entry`         | 提交预测（body：`marketId`, `selectedOption`, `pointsStaked?`）                                                                       |

`GET /api/manual/state` 与 `Cache-Control: private, no-store` 一同列入 `app.ts` 的 user-scoped GET 列表，避免共享缓存串号。

## 管理端结算

- `POST /api/admin/manual/predictions/settle`，JSON：`{ "marketId", "correctOption" }`。
- 将市场置为 `RESOLVED`，对 `OPEN` 的 entries 按 `market_kind` 入账或标记 `LOST`。
- 需已登录管理端 session（与其它 `/api/admin/*` 一致）。

## 注册挂钩

- `pgInsertUserWithState` 支持 `grantManualSignupBonus`：**真实注册**路径传 `true`；种子用户与测试夹具应传 `false`。
- Supabase / 本地 shadow / Remote KV 注册路径在创建用户后会调用 `tryGrantManualSignupBonus`（内部幂等）。

## 积分过期（规划）

- `rules.pointsExpiryDays`（默认 90）仅表达产品规则；**FIFO 过期抵扣尚未实现**，上线前需在 runbook 中说明或与财务/运营对齐后再开发 grant 批次表。

## 相关测试

- `tests/manualService*.test.ts` — 守卫与规则形状
- `tests/manualGamificationIntegration.test.ts` — MAIN 场结算、MAIN 日限次、engagement 幂等、推荐阶段二幂等（in-memory Postgres）
- `tests/manualApiRoutes.test.ts` — 未登录时 mutating 路由返回 401

## 合规与产品表述

- 对外宜强调「观点表达 / 教育 / 留存」，避免博彩话术；具体文案与地区合规以法务为准。

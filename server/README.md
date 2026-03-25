# NovaQuant Server

`server/` 是纯 API 层的架构边界。

职责：

- 用户认证、权限、会员
- AI 信号接收、存储、分发
- Nova / Gemini 聊天网关
- 给 `app/` 和 `admin/` 提供统一 API

边界：

- 不提供任何页面
- 是唯一允许读写数据库的层

推荐域名：

- `https://api.novaquant.cloud`

当前最稳的 Vercel 部署方式：

- API 项目直接从仓库根目录部署
- 原因是当前 serverless 路由仍然位于仓库根目录的 `/api`
- `server/` 保留为清晰的架构分层和后续完全抽离的目标目录

推荐环境变量：

- `NOVA_APP_ALLOWED_ORIGINS=https://app.novaquant.cloud,https://novaquant.cloud`
- `NOVA_ADMIN_ALLOWED_ORIGINS=https://admin.novaquant.cloud`
- `NOVA_MODEL_INGEST_TOKEN=<strong-random-secret>`

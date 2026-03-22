# NovaQuant Server

`server/` 是纯 API 层的独立 Vercel 项目。

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

推荐环境变量：

- `NOVA_APP_ALLOWED_ORIGINS=https://novaquant.cloud`
- `NOVA_ADMIN_ALLOWED_ORIGINS=https://admin.novaquant.cloud`
- `NOVA_MODEL_INGEST_TOKEN=<strong-random-secret>`

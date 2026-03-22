# NovaQuant App

`app/` 是用户端 H5 的独立 Vercel 项目。

边界：

- 只能调用 `https://api.novaquant.cloud`
- 不直接连接模型服务
- 不直接连接数据库

推荐环境变量：

- `VITE_API_BASE_URL=https://api.novaquant.cloud`

本地开发：

```bash
cd app
npm install
npm run dev
```

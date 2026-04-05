# NovaQuant App

`app/` 是登录后用户产品的独立 Vercel 项目。

边界：

- 只负责已登录用户主应用，例如 `Today / Nova / Browse / My`
- 只能调用 `https://api.novaquant.cloud`
- 不承载营销首页、公开 SEO 页面或管理员流程
- 不直接连接模型服务
- 不直接连接数据库

推荐公开环境变量：

- `VITE_API_BASE_URL=https://api.novaquant.cloud`
- `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<supabase publishable key>`
- `VITE_SUPABASE_AUTH_REDIRECT_URL=https://app.novaquant.cloud/`

如果前端不在 build 时注入这 3 个 Supabase 公共变量，运行时就必须依赖
`https://api.novaquant.cloud/api/auth/provider-config` 返回同样的值；否则注册、登录、
找回密码会直接判定为未配置。

本地开发：

```bash
cd app
npm install
npm run dev
```

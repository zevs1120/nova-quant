import { useState } from 'react';

export default function AdminLogin({ loading, error, onSubmit, apiBase }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="admin-login-shell">
      <section className="admin-login-card">
        <p className="admin-eyebrow">NovaQuant 管理后台</p>
        <h1>受限访问</h1>
        <p className="admin-muted">请使用具备管理员权限的账号登录。</p>

        <form
          className="admin-login-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit?.({ email, password });
          }}
        >
          <label className="admin-field">
            <span>邮箱</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@novaquant.cloud"
              required
            />
          </label>

          <label className="admin-field">
            <span>密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
            />
          </label>

          {error ? <p className="admin-error">{error}</p> : null}

          <button
            type="submit"
            className="admin-primary-btn"
            disabled={loading || !email || !password}
          >
            {loading ? '正在校验权限…' : '管理员登录'}
          </button>
        </form>

        <p className="admin-footnote">
          {apiBase ? `当前接口源：${apiBase}` : '当前接口源：同域代理'}
        </p>
      </section>
    </div>
  );
}

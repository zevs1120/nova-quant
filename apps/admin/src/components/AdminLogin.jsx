import { useState } from 'react';

export default function AdminLogin({ loading, error, onSubmit, apiBase }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="admin-login-shell">
      <section className="admin-login-card">
        <p className="admin-eyebrow">NovaQuant Admin</p>
        <h1>Restricted access</h1>
        <p className="admin-muted">
          This surface is for operator workflows only. Sign in with an account that has the `ADMIN` role.
        </p>

        <form
          className="admin-login-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit?.({ email, password });
          }}
        >
          <label className="admin-field">
            <span>Email</span>
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
            <span>Password</span>
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

          <button type="submit" className="admin-primary-btn" disabled={loading || !email || !password}>
            {loading ? 'Checking access…' : 'Admin sign in'}
          </button>
        </form>

        <p className="admin-footnote">API base: {apiBase}</p>
      </section>
    </div>
  );
}

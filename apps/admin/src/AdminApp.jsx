import { useEffect, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import { ADMIN_NAVIGATION } from './config/navigation';
import { PLANNED_ADMIN_APIS } from './services/plannedApi';
import OverviewPage from './pages/OverviewPage';
import UsersPage from './pages/UsersPage';
import AlphaLabPage from './pages/AlphaLabPage';
import SignalsExecutionPage from './pages/SignalsExecutionPage';
import SystemHealthPage from './pages/SystemHealthPage';
import AdminLogin from './components/AdminLogin';
import { getAdminApiBase, getAdminSession, loginAdmin, logoutAdmin } from './services/adminApi';

function renderPage(active) {
  if (active === 'users') return <UsersPage />;
  if (active === 'alpha-lab') return <AlphaLabPage />;
  if (active === 'signals-execution') return <SignalsExecutionPage />;
  if (active === 'system-health') return <SystemHealthPage />;
  return <OverviewPage />;
}

export default function AdminApp() {
  const [active, setActive] = useState('overview');
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const activeItem = useMemo(
    () => ADMIN_NAVIGATION.find((item) => item.id === active) || ADMIN_NAVIGATION[0],
    [active]
  );

  useEffect(() => {
    let cancelled = false;
    setChecking(true);
    getAdminSession()
      .then((payload) => {
        if (cancelled) return;
        setSession(payload);
        setAuthError('');
      })
      .catch(() => {
        if (cancelled) return;
        setSession(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) {
    return (
      <div className="admin-login-shell">
        <section className="admin-login-card">
          <p className="admin-eyebrow">NovaQuant Admin</p>
          <h1>Checking admin session</h1>
          <p className="admin-muted">Verifying access against the protected admin API.</p>
        </section>
      </div>
    );
  }

  if (!session?.authenticated || !session?.authorized) {
    return (
      <AdminLogin
        apiBase={getAdminApiBase()}
        loading={authLoading}
        error={authError}
        onSubmit={async (credentials) => {
          setAuthLoading(true);
          setAuthError('');
          try {
            const payload = await loginAdmin(credentials);
            setSession(payload);
          } catch (error) {
            const code = String(error?.message || 'ADMIN_ACCESS_DENIED');
            setAuthError(code === 'INVALID_CREDENTIALS' ? 'Invalid credentials.' : 'Admin access denied.');
          } finally {
            setAuthLoading(false);
          }
        }}
      />
    );
  }

  return (
    <div className="admin-shell">
      <Sidebar items={ADMIN_NAVIGATION} activeId={active} onSelect={setActive} />
      <main className="admin-main">
        <Topbar
          title={activeItem.label}
          subtitle={activeItem.description}
          session={session}
          onLogout={async () => {
            await logoutAdmin().catch(() => {});
            setSession(null);
          }}
        />

        {renderPage(active)}

        <section className="panel">
          <div className="panel-header">
            <h3>Planned Admin API Surface</h3>
            <span className="status-pill is-slate">Next implementation step</span>
          </div>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Purpose</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {PLANNED_ADMIN_APIS.map((row) => (
                  <tr key={row.route}>
                    <td>{row.route}</td>
                    <td>{row.purpose}</td>
                    <td>
                      <span className="status-pill is-slate">{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

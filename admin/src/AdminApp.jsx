import { useEffect, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import { ADMIN_NAVIGATION } from './config/navigation';
import OverviewPage from './pages/OverviewPage';
import UsersPage from './pages/UsersPage';
import StrategyFactoryPage from './pages/StrategyFactoryPage';
import SignalsExecutionPage from './pages/SignalsExecutionPage';
import SystemHealthPage from './pages/SystemHealthPage';
import AdminLogin from './components/AdminLogin';
import { getAdminApiBase, getAdminSession, loginAdmin, logoutAdmin } from './services/adminApi';

function mapAdminAuthErrorMessage(error) {
  const code = String(error?.message || 'ADMIN_ACCESS_DENIED');
  if (code === 'INVALID_CREDENTIALS') return '邮箱或密码错误。';
  if (
    code === 'AUTH_STORE_NOT_CONFIGURED' ||
    code === 'AUTH_STORE_UNREACHABLE' ||
    code === 'AUTH_SERVICE_ERROR' ||
    code === 'ADMIN_REQUEST_TIMEOUT' ||
    code === 'HTTP_500' ||
    code === 'HTTP_502' ||
    code === 'HTTP_503' ||
    code === 'HTTP_504'
  ) {
    return '管理员登录服务当前不可用，请稍后重试。';
  }
  return '当前账号没有管理员权限。';
}

function renderPage(active) {
  if (active === 'users') return <UsersPage />;
  if (active === 'alpha-lab' || active === 'research-ops') return <StrategyFactoryPage />;
  if (active === 'signals-execution') return <SignalsExecutionPage />;
  if (active === 'system-health') return <SystemHealthPage />;
  return <OverviewPage />;
}

function AdminBackdrop({ children }) {
  return (
    <div className="admin-world">
      <div className="admin-noise" aria-hidden="true" />
      <div className="admin-gradient admin-gradient-one" aria-hidden="true" />
      <div className="admin-gradient admin-gradient-two" aria-hidden="true" />
      <div className="admin-gradient admin-gradient-three" aria-hidden="true" />
      {children}
    </div>
  );
}

export default function AdminApp() {
  const [active, setActive] = useState('overview');
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const activeItem = useMemo(
    () => ADMIN_NAVIGATION.find((item) => item.id === active) || ADMIN_NAVIGATION[0],
    [active],
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
      .catch((error) => {
        if (cancelled) return;
        setSession(null);
        const code = String(error?.message || '');
        setAuthError(code === 'HTTP_401' ? '' : mapAdminAuthErrorMessage(error));
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
      <AdminBackdrop>
        <div className="admin-login-shell">
          <section className="admin-login-card">
            <p className="admin-eyebrow">NovaQuant 管理后台</p>
            <h1>正在检查管理员会话</h1>
            <p className="admin-muted">正在通过受保护的管理员 API 验证访问权限。</p>
          </section>
        </div>
      </AdminBackdrop>
    );
  }

  if (!session?.authenticated || !session?.authorized) {
    return (
      <AdminBackdrop>
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
              setAuthError(mapAdminAuthErrorMessage(error));
            } finally {
              setAuthLoading(false);
            }
          }}
        />
      </AdminBackdrop>
    );
  }

  return (
    <AdminBackdrop>
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
        </main>
      </div>
    </AdminBackdrop>
  );
}

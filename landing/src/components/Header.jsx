const homeNavItems = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#guide' },
  { label: 'Distribution', href: '#about' },
  { label: 'Data Portal', href: '/data-portal/' },
];

const portalNavItems = [
  { label: 'Overview', href: '#portal-top' },
  { label: 'Backtest', href: '#backtest' },
  { label: 'Analytics', href: '#analytics' },
  { label: 'Flywheel', href: '#flywheel' },
  { label: 'Data Fabric', href: '#fabric' },
];

export default function Header({ page = 'home' }) {
  const isPortalPage = page === 'data-portal';
  const navItems = isPortalPage ? portalNavItems : homeNavItems;
  const brandHref = isPortalPage ? '/' : '#top';
  const ctaHref = 'https://app.novaquant.cloud';
  const ctaLabel = 'Get Started';

  return (
    <header className="site-header-shell">
      <div className="site-header">
        <a className="site-brand" href={brandHref} aria-label="NovaQuant home">
          <img className="site-brand-logo" src="/brand-assets/nova-logo.png" alt="NovaQuant" />
        </a>

        <nav className="site-nav" aria-label="Primary">
          {navItems.map((item) => (
            <a
              className={`site-nav-link${isPortalPage && item.label === 'Overview' ? ' site-nav-link-active' : ''}`}
              href={item.href}
              key={item.label}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="site-header-actions">
          {isPortalPage ? (
            <a className="site-header-return" href="/">
              Main Page
            </a>
          ) : null}

          <a className="site-header-cta" href={ctaHref}>
            {ctaLabel}
          </a>
        </div>
      </div>
    </header>
  );
}

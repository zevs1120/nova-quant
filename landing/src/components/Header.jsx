export default function Header() {
  return (
    <header className="site-header-shell">
      <div className="site-header">
        <a className="site-brand" href="#top" aria-label="NovaQuant home">
          <img className="site-brand-logo" src="/brand-assets/nova-logo.png" alt="NovaQuant" />
        </a>

        <nav className="site-nav" aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#guide">FAQ</a>
          <a href="#about">Distribution</a>
        </nav>

        <a className="site-header-cta" href="https://app.novaquant.cloud">
          sign up
        </a>
      </div>
    </header>
  );
}

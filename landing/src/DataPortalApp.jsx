import Header from './components/Header.jsx';
import DataPortalPage from './components/DataPortalPage.jsx';
import LegalFooter from './components/LegalFooter.jsx';

const portalFooterLinks = [
  { label: 'Overview', href: '#portal-top' },
  { label: 'Backtest', href: '#backtest' },
  { label: 'Flywheel', href: '#flywheel' },
  { label: 'Open App', href: 'https://app.novaquant.cloud' },
];

export default function DataPortalApp() {
  return (
    <div className="world">
      <div className="page-noise" aria-hidden="true" />
      <div className="page-gradient page-gradient-one" aria-hidden="true" />
      <div className="page-gradient page-gradient-two" aria-hidden="true" />

      <Header page="data-portal" />

      <main className="page-shell page-shell-portal" id="top">
        <DataPortalPage />
        <LegalFooter
          brandHref="/"
          links={portalFooterLinks}
          privacyHref="#fabric"
          privacyLabel="Inspect the fabric"
        />
      </main>
    </div>
  );
}

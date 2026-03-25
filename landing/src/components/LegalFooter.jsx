import { legalLinks, legalParagraphs, legalNotes } from '../data/index.js';

export default function LegalFooter() {
  return (
    <section className="spread legal-spread" id="legal">
      <div className="legal-surface">
        <div className="campaign-grid legal-grid">
          <div className="legal-topbar">
            <a className="legal-brand" href="#top" aria-label="NovaQuant home">
              <img
                className="legal-brand-logo"
                src="/brand-assets/nova-logo.png"
                alt="NovaQuant"
              />
            </a>

            <nav className="legal-links" aria-label="Footer">
              {legalLinks.map((link) => (
                <a href={link.href} key={link.label}>
                  {link.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="legal-copy">
            {legalParagraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <div className="legal-meta">
            <p className="legal-copyright">© 2026 NovaQuant. All rights reserved.</p>
            <p className="legal-heading">Important Notes</p>

            <div className="legal-notes">
              {legalNotes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>

            <a className="legal-privacy" href="#guide">
              Your privacy choices
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

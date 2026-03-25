export default function HeroSection() {
  return (
    <section className="spread hero-spread">
      <div className="campaign-grid hero-grid">
        <div className="hero-stage" aria-hidden="true">
          <div className="hero-stage-grid" />
          <div className="hero-flat hero-flat-lilac halftone-field" />
          <div className="hero-flat hero-flat-blue" />
          <div className="hero-flat hero-flat-pink halftone-field" />
          <div className="hero-flat hero-flat-violet" />
          <div className="hero-flat hero-flat-mint" />
        </div>

        <div className="hero-copy">
          <p className="hero-pretitle">Hello World, I am NovaQuant</p>
          <h1 className="hero-title">
            <span className="hero-title-top">Read the day</span>
            <span className="hero-title-bottom">differently.</span>
          </h1>
          <p className="micro-intro">
            NovaQuant turns market complexity into clear daily intelligence, powered by Marvix,
            our in-house AI model built to surface what matters and help you act with more
            clarity.
          </p>

          <div className="hero-actions">
            <a className="hero-cta" href="https://app.novaquant.cloud">
              Get started
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

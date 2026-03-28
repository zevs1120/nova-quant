import {
  useMotionPreference,
  useScrollProgress,
  useViewportReveal,
} from '../hooks/useViewportMotion.js';

export default function HeroSection() {
  const useSoftMotion = useMotionPreference('(prefers-reduced-motion: reduce), (max-width: 760px)');
  const { ref, isVisible } = useViewportReveal({
    threshold: useSoftMotion ? 0.08 : 0.18,
    rootMargin: useSoftMotion ? '0px 0px 0px 0px' : '0px 0px -4% 0px',
  });
  const scrollProgress = useScrollProgress(ref, { disabled: useSoftMotion });
  const heroProgress = useSoftMotion ? 0.22 : scrollProgress;

  return (
    <section
      ref={ref}
      className={`spread hero-spread${isVisible ? ' is-motion-visible' : ''}${useSoftMotion ? ' is-motion-soft' : ''}`}
      style={{ '--hero-progress': heroProgress.toFixed(4) }}
    >
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
            NovaQuant turns market complexity into clear daily intelligence, powered by Marvix, our
            in-house AI model built to surface what matters and help you act with more clarity.
          </p>

          <div className="hero-actions">
            <a className="hero-cta" href="https://app.novaquant.cloud">
              Get Started
            </a>
            <a className="hero-cta hero-cta-secondary" href="/data-portal/">
              Data Portal
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

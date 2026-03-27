import { reactions } from '../data/index.js';
import { useViewportReveal } from '../hooks/useViewportMotion.js';

export default function VoicesSection() {
  const { ref, isVisible } = useViewportReveal();

  return (
    <section ref={ref} className={`spread voices-spread${isVisible ? ' is-motion-visible' : ''}`}>
      <div className="campaign-grid voices-grid">
        <div className="voices-title-block">
          <p className="voices-kicker">First reactions</p>
          <h2 className="voices-title">
            <span>In their words,</span>
            <span>NovaQuant.</span>
          </h2>
        </div>

        {reactions.map((item, index) => (
          <blockquote
            className={item.className}
            key={item.quote}
            style={{
              '--voice-order': index,
              '--voice-enter-delay': `${index * 100}ms`,
            }}
          >
            <p>{item.quote}</p>
            <cite>{item.source}</cite>
          </blockquote>
        ))}

        <a className="voices-link" href="https://app.novaquant.cloud" id="enter">
          Open NovaQuant
        </a>
      </div>
    </section>
  );
}

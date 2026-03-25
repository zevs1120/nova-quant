import { reactions } from '../data/index.js';

export default function VoicesSection() {
  return (
    <section className="spread voices-spread">
      <div className="campaign-grid voices-grid">
        <div className="voices-title-block">
          <p className="voices-kicker">First reactions</p>
          <h2 className="voices-title">
            <span>In their words,</span>
            <span>NovaQuant.</span>
          </h2>
        </div>

        {reactions.map((item) => (
          <blockquote className={item.className} key={item.quote}>
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

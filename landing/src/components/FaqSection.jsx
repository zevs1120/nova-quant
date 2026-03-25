import { faqs } from '../data/index.js';

export default function FaqSection() {
  return (
    <section className="spread faq-spread" id="guide">
      <div className="campaign-grid faq-grid">
        <div className="faq-intro">
          <h2>FAQ</h2>
        </div>

        <div className="faq-board">
          {faqs.map((item) => (
            <details className="faq-item" key={item.question}>
              <summary>
                <span className="faq-question">{item.question}</span>
              </summary>
              <p className="faq-answer">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

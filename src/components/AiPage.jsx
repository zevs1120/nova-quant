import { useEffect, useRef, useState } from 'react';
import Skeleton from './Skeleton';
import { answerWithRetrieval } from '../quant/aiRetrieval';

const COPILOT_SECTIONS = ['VERDICT', 'PLAN', 'WHY', 'RISK', 'EVIDENCE'];
const QUICK_QUESTIONS = [
  'Why this signal?',
  'Is this safe today?',
  'Should I enter now?',
  'Explain the strategy'
];

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseStructuredReply(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const sections = {};
  let current = null;

  for (const line of text.split('\n')) {
    const headingMatch = line.match(/^(?:\s*#{1,3}\s*)?(VERDICT|PLAN|WHY|RISK|EVIDENCE)\s*[:：-]?\s*(.*)$/i);
    if (headingMatch) {
      current = headingMatch[1].toUpperCase();
      sections[current] = sections[current] || '';
      if (headingMatch[2]) sections[current] = `${sections[current]}${headingMatch[2]}\n`;
      continue;
    }
    if (current) sections[current] = `${sections[current] || ''}${line}\n`;
  }

  const normalized = Object.fromEntries(COPILOT_SECTIONS.map((key) => [key, String(sections[key] || '').trim()]));
  const hasCore = normalized.VERDICT && normalized.PLAN && normalized.WHY && normalized.RISK;
  if (!hasCore) return null;
  return normalized;
}

function splitList(text) {
  return String(text || '')
    .split('\n')
    .map((item) => item.replace(/^\s*[-*•\d.)]+\s*/, '').trim())
    .filter(Boolean);
}

function chooseNextStep(question = '') {
  const text = String(question || '').toLowerCase();
  if (text.includes('holding') || text.includes('portfolio') || text.includes('持仓')) {
    return { target: 'holdings', label: 'Open Holdings' };
  }
  if (text.includes('week') || text.includes('weekly') || text.includes('下周')) {
    return { target: 'more:weekly', label: 'Open Weekly Review' };
  }
  if (text.includes('risk') || text.includes('safe') || text.includes('风险')) {
    return { target: 'more:safety', label: 'Open Safety' };
  }
  return { target: 'today', label: 'Back to Today' };
}

function CopilotStructuredReply({ message, onNavigate }) {
  const parsed = parseStructuredReply(message.content);
  const nextStep = message.nextStep || chooseNextStep(message.question);

  if (!parsed) {
    return (
      <article className="ai-bubble ai-assistant ai-rich-bubble">
        <p className="ai-rich-verdict">{message.content}</p>
        <div className="action-row" style={{ marginTop: 8 }}>
          <button type="button" className="quick-ask-btn" onClick={() => onNavigate?.(nextStep.target)}>
            {nextStep.label}
          </button>
        </div>
      </article>
    );
  }

  const reasonLines = splitList(parsed.WHY).slice(0, 3);
  const actionLines = splitList(parsed.PLAN).slice(0, 3);
  const riskLines = splitList(parsed.RISK).slice(0, 2);
  const evidenceLines = splitList(parsed.EVIDENCE).slice(0, 2);

  return (
    <article className="ai-bubble ai-assistant ai-rich-bubble">
      <p className="ai-rich-verdict">{parsed.VERDICT}</p>

      <div className="ai-rich-block">
        <p className="ai-rich-label">What to do</p>
        <ul className="ai-mini-list">
          {actionLines.map((line, index) => (
            <li key={`plan-${index}`}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="ai-rich-block">
        <p className="ai-rich-label">Why</p>
        <ul className="ai-mini-list">
          {reasonLines.map((line, index) => (
            <li key={`why-${index}`}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="ai-rich-block">
        <p className="ai-rich-label">Keep in mind</p>
        <ul className="ai-mini-list">
          {riskLines.map((line, index) => (
            <li key={`risk-${index}`}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="action-row">
        <button type="button" className="quick-ask-btn" onClick={() => onNavigate?.(nextStep.target)}>
          {nextStep.label}
        </button>
      </div>

      {evidenceLines.length ? (
        <p className="muted status-line">Source: {evidenceLines.join(' ')}</p>
      ) : null}
    </article>
  );
}

export default function AiPage({ locale, quantState, seedRequest, onNavigate }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const listRef = useRef(null);
  const seededRef = useRef(null);
  const demoSeededRef = useRef(false);
  const isDemoMode = Boolean(quantState?.performance?.investor_demo);

  const sendMessage = async (rawText) => {
    const text = String(rawText || '').trim();
    if (!text || streaming) return;

    setStreaming(true);
    setMessages((current) => [...current, { id: randomId(), role: 'user', content: text }]);
    setInput('');

    await new Promise((resolve) => setTimeout(resolve, 140));

    const answer = answerWithRetrieval(text, quantState);
    setMessages((current) => [
      ...current,
      {
        id: randomId(),
        role: 'assistant',
        content: answer.text,
        question: text,
        nextStep: chooseNextStep(text)
      }
    ]);
    setStreaming(false);
  };

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, streaming]);

  useEffect(() => {
    if (!seedRequest?.id || !seedRequest?.message) return;
    if (seededRef.current === seedRequest.id) return;
    seededRef.current = seedRequest.id;
    void sendMessage(seedRequest.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedRequest?.id, seedRequest?.message]);

  useEffect(() => {
    if (!isDemoMode || demoSeededRef.current || messages.length) return;
    demoSeededRef.current = true;
    const sampleQuestion = 'Why this signal?';
    const sampleAnswer = answerWithRetrieval(sampleQuestion, quantState);
    setMessages([
      { id: randomId(), role: 'user', content: sampleQuestion },
      {
        id: randomId(),
        role: 'assistant',
        content: sampleAnswer.text,
        question: sampleQuestion,
        nextStep: chooseNextStep(sampleQuestion)
      }
    ]);
  }, [isDemoMode, messages.length, quantState]);

  return (
    <section className="stack-gap ai-tab-shell">
      <article className="glass-card">
        <h3 className="card-title">Quick questions</h3>
        <div className="ai-chip-cluster" style={{ marginTop: 10 }}>
          {QUICK_QUESTIONS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="ai-chip"
              onClick={() => {
                void sendMessage(prompt);
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      </article>

      <article className="glass-card ai-chat-panel ai-tab-chat-panel">
        <div className="ai-thread ai-tab-thread" ref={listRef}>
          {!messages.length ? (
            <article className="ai-empty">
              <p>Start with one simple question.</p>
              <p className="muted">Try “Why this signal?” or “Is this safe today?”</p>
            </article>
          ) : (
            messages.map((item) =>
              item.role === 'assistant' ? (
                <CopilotStructuredReply key={item.id} message={item} onNavigate={onNavigate} />
              ) : (
                <article key={item.id} className={`ai-bubble ai-${item.role}`}>
                  {item.content}
                </article>
              )
            )
          )}

          {streaming ? <Skeleton lines={2} compact className="ai-response-skeleton" /> : null}
        </div>
      </article>

      <form
        className="ai-input-row ai-input-dock"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(input);
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="ai-input"
          placeholder="Ask Nova in plain words"
          disabled={streaming}
        />
        <button type="submit" className="primary-btn ai-send" disabled={streaming || !input.trim()}>
          {streaming ? 'Thinking' : 'Send'}
        </button>
      </form>
    </section>
  );
}

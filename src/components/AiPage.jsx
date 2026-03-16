import { useEffect, useMemo, useRef, useState } from 'react';
import Skeleton from './Skeleton';
import { useNovaAssistant } from '../hooks/useNovaAssistant';
import { useDemoAssistant } from '../hooks/useDemoAssistant';

const COPILOT_SECTIONS = ['VERDICT', 'PLAN', 'WHY', 'RISK', 'EVIDENCE'];
const QUICK_QUESTIONS = [
  'What should I do today?',
  'Is it safe to try anything?',
  'Why are we waiting?',
  'Should I enter now?'
];

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
    if (current) {
      sections[current] = `${sections[current] || ''}${line}\n`;
    } else {
      sections.VERDICT = `${sections.VERDICT || ''}${line}\n`;
    }
  }

  const normalized = Object.fromEntries(COPILOT_SECTIONS.map((key) => [key, String(sections[key] || '').trim()]));
  return Object.values(normalized).some(Boolean) ? normalized : null;
}

function splitList(text) {
  return String(text || '')
    .split('\n')
    .map((item) => item.replace(/^\s*[-*•\d.)]+\s*/, '').trim())
    .filter(Boolean);
}

function splitParagraphs(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
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
  return { target: 'today', label: 'Open Today' };
}

function AssistantResponseSection({ title, lines }) {
  if (!lines.length) return null;
  return (
    <section className="ai-response-section">
      <p className="ai-response-section-title">{title}</p>
      <div className="ai-response-section-body">
        {lines.map((line, index) => (
          <p key={`${title}-${index}`}>{line}</p>
        ))}
      </div>
    </section>
  );
}

function AssistantMessage({ message, onNavigate }) {
  const parsed = parseStructuredReply(message.content);
  const nextStep = message.nextStep || chooseNextStep(message.question);
  const [expanded, setExpanded] = useState(false);

  if (!parsed) {
    const paragraphs = splitParagraphs(message.content);
    const lead = paragraphs[0] || message.content;
    const rest = paragraphs.slice(1);
    const visible = expanded ? rest : rest.slice(0, 1);
    const showToggle = rest.length > 1;

    return (
      <article className="ai-message ai-message-assistant">
        <div className="ai-message-avatar" aria-hidden="true">
          ✦
        </div>
        <div className="ai-message-body">
          <div className="ai-assistant-card">
            <p className="ai-assistant-lead">{lead}</p>
            {visible.map((paragraph, index) => (
              <p key={`fallback-${index}`} className="ai-assistant-copy">
                {paragraph}
              </p>
            ))}
            {showToggle ? (
              <button type="button" className="ai-inline-toggle" onClick={() => setExpanded((value) => !value)}>
                {expanded ? 'Show less' : 'Show more'}
              </button>
            ) : null}
            <div className="ai-assistant-footer">
              <button type="button" className="ai-inline-link" onClick={() => onNavigate?.(nextStep.target)}>
                {nextStep.label}
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  const verdict = splitParagraphs(parsed.VERDICT)[0] || parsed.VERDICT;
  const planLines = splitList(parsed.PLAN).slice(0, expanded ? 5 : 3);
  const whyLines = splitList(parsed.WHY).slice(0, expanded ? 4 : 2);
  const riskLines = splitList(parsed.RISK).slice(0, expanded ? 4 : 2);
  const evidenceLines = splitList(parsed.EVIDENCE).slice(0, expanded ? 3 : 1);
  const hasExtraContent =
    splitList(parsed.PLAN).length > 3 ||
    splitList(parsed.WHY).length > 2 ||
    splitList(parsed.RISK).length > 2 ||
    splitList(parsed.EVIDENCE).length > 1;

  return (
    <article className="ai-message ai-message-assistant">
      <div className="ai-message-avatar" aria-hidden="true">
        ✦
      </div>
      <div className="ai-message-body">
        <div className="ai-assistant-card">
          <section className="ai-response-section ai-response-section-lead">
            <p className="ai-response-section-title">Today’s call</p>
            <p className="ai-assistant-lead">{verdict}</p>
          </section>

          <AssistantResponseSection title="What to do" lines={planLines} />
          <AssistantResponseSection title="Why" lines={whyLines} />
          <AssistantResponseSection title="Risk" lines={riskLines} />

          {hasExtraContent ? (
            <button type="button" className="ai-inline-toggle" onClick={() => setExpanded((value) => !value)}>
              {expanded ? 'Hide detail' : 'Show detail'}
            </button>
          ) : null}

          {expanded && evidenceLines.length ? (
            <section className="ai-response-section ai-response-section-evidence">
              <p className="ai-response-section-title">Source</p>
              <div className="ai-response-section-body">
                {evidenceLines.map((line, index) => (
                  <p key={`evidence-${index}`}>{line}</p>
                ))}
              </div>
            </section>
          ) : null}

          <div className="ai-assistant-footer">
            <button type="button" className="ai-inline-link" onClick={() => onNavigate?.(nextStep.target)}>
              {nextStep.label}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function UserMessage({ content }) {
  return (
    <article className="ai-message ai-message-user">
      <div className="ai-message-body">
        <div className="ai-user-bubble">{content}</div>
      </div>
    </article>
  );
}

function Composer({ input, setInput, streaming, sendMessage, hasMessages }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = '0px';
    const nextHeight = Math.min(textareaRef.current.scrollHeight, 132);
    textareaRef.current.style.height = `${Math.max(nextHeight, 22)}px`;
  }, [input]);

  const canSend = Boolean(input.trim()) && !streaming;

  return (
    <div className="ai-composer-shell">
      <div className={`ai-suggestion-row ${hasMessages ? 'has-thread' : 'is-empty'}`}>
        {QUICK_QUESTIONS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="ai-suggestion-chip"
            onClick={() => {
              setInput(prompt);
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      <form
        className="ai-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSend) return;
          void sendMessage(input);
        }}
      >
        <div className="ai-composer-field">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="ai-composer-input"
            placeholder="Ask in plain words"
            rows={1}
            disabled={streaming}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!canSend) return;
                void sendMessage(input);
              }
            }}
          />
          <button type="submit" className="ai-composer-send" disabled={!canSend}>
            {streaming ? '…' : '↑'}
          </button>
        </div>
      </form>
    </div>
  );
}

function AiConversationShell({ messages, input, setInput, streaming, error, sendMessage, onNavigate }) {
  const listRef = useRef(null);
  const hasMessages = messages.length > 0;

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, streaming]);

  const starterQuestions = useMemo(() => QUICK_QUESTIONS.slice(0, 4), []);

  return (
    <section className={`ai-page-shell ${hasMessages ? 'ai-page-thread' : 'ai-page-empty'}`}>
      <div className="ai-thread-scroll" ref={listRef}>
        {!hasMessages ? (
          <section className="ai-empty-stage">
            <div className="ai-empty-stage-copy">
              <p className="ai-empty-badge">Nova</p>
              <h1 className="ai-empty-heading">Ask what today means.</h1>
              <p className="ai-empty-subheading">Short questions work best. We will give you the call first, then the reason.</p>
            </div>
            <div className="ai-starter-stack">
              {starterQuestions.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="ai-starter-card"
                  onClick={() => {
                    setInput(prompt);
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div className="ai-thread-stack">
            {messages.map((item) =>
              item.role === 'assistant' ? (
                <AssistantMessage key={item.id} message={item} onNavigate={onNavigate} />
              ) : (
                <UserMessage key={item.id} content={item.content} />
              )
            )}

            {streaming ? (
              <article className="ai-message ai-message-assistant">
                <div className="ai-message-avatar" aria-hidden="true">
                  ✦
                </div>
                <div className="ai-message-body">
                  <div className="ai-assistant-card ai-assistant-loading">
                    <Skeleton lines={2} compact className="ai-response-skeleton" />
                  </div>
                </div>
              </article>
            ) : null}
          </div>
        )}
      </div>

      {error ? (
        <div className="ai-error-toast" role="status">
          {error}
        </div>
      ) : null}

      <Composer
        input={input}
        setInput={setInput}
        streaming={streaming}
        sendMessage={sendMessage}
        hasMessages={hasMessages}
      />
    </section>
  );
}

function LiveAiConversation({ seedRequest, onNavigate, userId, baseContext }) {
  const assistant = useNovaAssistant({
    userId,
    seedRequest,
    contextBase: {
      page: 'ai',
      market: baseContext?.market,
      assetClass: baseContext?.assetClass,
      timeframe: baseContext?.timeframe,
      riskProfileKey: baseContext?.riskProfileKey,
      uiMode: baseContext?.uiMode,
      decisionSummary: baseContext?.decisionSummary,
      holdingsSummary: baseContext?.holdingsSummary
    }
  });

  return <AiConversationShell {...assistant} onNavigate={onNavigate} />;
}

function DemoAiConversation({ quantState, seedRequest, onNavigate, userId, baseContext }) {
  const assistant = useDemoAssistant({
    userId,
    seedRequest,
    demoState: quantState,
    contextBase: {
      page: 'ai',
      market: baseContext?.market,
      assetClass: baseContext?.assetClass,
      timeframe: baseContext?.timeframe,
      riskProfileKey: baseContext?.riskProfileKey,
      uiMode: baseContext?.uiMode,
      decisionSummary: baseContext?.decisionSummary,
      holdingsSummary: baseContext?.holdingsSummary
    }
  });
  const { messages, sendMessage } = assistant;

  useEffect(() => {
    if (seedRequest?.message) return;
    if (messages.length) return;
    void sendMessage('What should I do today?', {
      page: 'today',
      market: baseContext?.market,
      assetClass: baseContext?.assetClass
    });
  }, [seedRequest?.message, messages.length, sendMessage, baseContext?.market, baseContext?.assetClass]);

  return <AiConversationShell {...assistant} onNavigate={onNavigate} />;
}

export default function AiPage({ quantState, seedRequest, onNavigate, userId, baseContext }) {
  const isDemoMode = Boolean(quantState?.performance?.investor_demo);

  if (isDemoMode) {
    return (
      <DemoAiConversation
        quantState={quantState}
        seedRequest={seedRequest}
        onNavigate={onNavigate}
        userId={userId}
        baseContext={baseContext}
      />
    );
  }

  return (
    <LiveAiConversation
      seedRequest={seedRequest}
      onNavigate={onNavigate}
      userId={userId}
      baseContext={baseContext}
    />
  );
}

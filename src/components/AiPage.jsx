import { useEffect, useMemo, useRef, useState } from 'react';
import Skeleton from './Skeleton';
import { useNovaAssistant } from '../hooks/useNovaAssistant';
import { useDemoAssistant } from '../hooks/useDemoAssistant';
import { parseAssistantSectionHeading } from '../utils/assistantLanguage';

const COPILOT_SECTIONS = ['VERDICT', 'PLAN', 'WHY', 'RISK', 'EVIDENCE'];

function buildAiCopy(locale = 'en-US') {
  const lang = String(locale || '')
    .toLowerCase()
    .startsWith('zh')
    ? 'zh'
    : 'en';
  return {
    quickQuestions:
      lang === 'zh'
        ? ['我今天该怎么做？', '现在适合出手吗？', '为什么我们还在等？', '我现在应该进场吗？']
        : [
            'What should I do today?',
            'Is it safe to try anything?',
            'Why are we waiting?',
            'Should I enter now?',
          ],
    nextStep: {
      holdings: lang === 'zh' ? '打开持仓' : 'Open Holdings',
      weekly: lang === 'zh' ? '打开周复盘' : 'Open Weekly Review',
      safety: lang === 'zh' ? '打开安全页' : 'Open Safety',
      today: lang === 'zh' ? '打开今日' : 'Open Today',
    },
    fallback: {
      showLess: lang === 'zh' ? '收起' : 'Show less',
      showMore: lang === 'zh' ? '展开' : 'Show more',
      hideDetail: lang === 'zh' ? '收起细节' : 'Hide detail',
      showDetail: lang === 'zh' ? '展开细节' : 'Show detail',
    },
    sections: {
      verdict: lang === 'zh' ? '今日判断' : 'Today’s call',
      plan: lang === 'zh' ? '该怎么做' : 'What to do',
      why: lang === 'zh' ? '为什么' : 'Why',
      risk: lang === 'zh' ? '风险' : 'Risk',
      evidence: lang === 'zh' ? '证据' : 'Source',
    },
    composerPlaceholder: lang === 'zh' ? '直接用自然语言问我' : 'Ask in plain words',
    emptyBadge: 'Nova',
    emptyHeading: lang === 'zh' ? '问我，今天到底意味着什么。' : 'Ask what today means.',
    emptySubheading:
      lang === 'zh'
        ? '短问题就可以。我们会先告诉你判断，再告诉你原因。'
        : 'Short questions work best. We will give you the call first, then the reason.',
    autoQuestion: lang === 'zh' ? '我今天该怎么做？' : 'What should I do today?',
    aiError: {
      failed: lang === 'zh' ? '生成回答失败' : 'Failed to generate response',
      preparing:
        lang === 'zh'
          ? '我在准备回答时遇到了一点问题。'
          : 'I hit a problem while preparing an answer.',
    },
    locale: lang,
  };
}

function parseStructuredReply(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const sections = {};
  let current = null;

  for (const line of text.split('\n')) {
    const headingMatch = parseAssistantSectionHeading(line);
    if (headingMatch) {
      current = headingMatch.key.toUpperCase();
      sections[current] = sections[current] || '';
      if (headingMatch.rest) sections[current] = `${sections[current]}${headingMatch.rest}\n`;
      continue;
    }
    if (current) {
      sections[current] = `${sections[current] || ''}${line}\n`;
    } else {
      sections.VERDICT = `${sections.VERDICT || ''}${line}\n`;
    }
  }

  const normalized = Object.fromEntries(
    COPILOT_SECTIONS.map((key) => [key, String(sections[key] || '').trim()]),
  );
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

function chooseNextStep(question = '', copy = buildAiCopy()) {
  const text = String(question || '').toLowerCase();
  if (text.includes('holding') || text.includes('portfolio') || text.includes('持仓')) {
    return { target: 'holdings', label: copy.nextStep.holdings };
  }
  if (text.includes('week') || text.includes('weekly') || text.includes('下周')) {
    return { target: 'more:weekly', label: copy.nextStep.weekly };
  }
  if (text.includes('risk') || text.includes('safe') || text.includes('风险')) {
    return { target: 'more:safety', label: copy.nextStep.safety };
  }
  return { target: 'today', label: copy.nextStep.today };
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

function AssistantMessage({ message, onNavigate, copy }) {
  if (!String(message.content || '').trim()) {
    return (
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
    );
  }

  const parsed = parseStructuredReply(message.content);
  const nextStep = message.nextStep || chooseNextStep(message.question, copy);
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
              <button
                type="button"
                className="ai-inline-toggle"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? copy.fallback.showLess : copy.fallback.showMore}
              </button>
            ) : null}
            <div className="ai-assistant-footer">
              <button
                type="button"
                className="ai-inline-link"
                onClick={() => onNavigate?.(nextStep.target)}
              >
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
            <p className="ai-response-section-title">{copy.sections.verdict}</p>
            <p className="ai-assistant-lead">{verdict}</p>
          </section>

          <AssistantResponseSection title={copy.sections.plan} lines={planLines} />
          <AssistantResponseSection title={copy.sections.why} lines={whyLines} />
          <AssistantResponseSection title={copy.sections.risk} lines={riskLines} />

          {hasExtraContent ? (
            <button
              type="button"
              className="ai-inline-toggle"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? copy.fallback.hideDetail : copy.fallback.showDetail}
            </button>
          ) : null}

          {expanded && evidenceLines.length ? (
            <section className="ai-response-section ai-response-section-evidence">
              <p className="ai-response-section-title">{copy.sections.evidence}</p>
              <div className="ai-response-section-body">
                {evidenceLines.map((line, index) => (
                  <p key={`evidence-${index}`}>{line}</p>
                ))}
              </div>
            </section>
          ) : null}

          <div className="ai-assistant-footer">
            <button
              type="button"
              className="ai-inline-link"
              onClick={() => onNavigate?.(nextStep.target)}
            >
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

function Composer({ input, setInput, streaming, sendMessage, hasMessages, copy }) {
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
        {copy.quickQuestions.map((prompt) => (
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
            placeholder={copy.composerPlaceholder}
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

function AiConversationShell({
  messages,
  input,
  setInput,
  streaming,
  error,
  sendMessage,
  onNavigate,
  locale,
}) {
  const listRef = useRef(null);
  const endRef = useRef(null);
  const hasMessages = messages.length > 0;
  const copy = useMemo(() => buildAiCopy(locale), [locale]);

  useEffect(() => {
    if (!listRef.current) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const thread = listRef.current;
      thread.scrollTop = thread.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, streaming]);

  return (
    <section className={`ai-page-shell ${hasMessages ? 'ai-page-thread' : 'ai-page-empty'}`}>
      <div className="ai-thread-scroll" ref={listRef}>
        {!hasMessages ? (
          <section className="ai-empty-stage">
            <div className="ai-empty-stage-panel">
              <div className="ai-empty-stage-mark" aria-hidden="true">
                ✦
              </div>
              <div className="ai-empty-stage-copy">
                <p className="ai-empty-badge">{copy.emptyBadge}</p>
                <h1 className="ai-empty-heading">{copy.emptyHeading}</h1>
                <p className="ai-empty-subheading">{copy.emptySubheading}</p>
              </div>
            </div>
          </section>
        ) : (
          <div className="ai-thread-stack">
            {messages.map((item) =>
              item.role === 'assistant' ? (
                <AssistantMessage
                  key={item.id}
                  message={item}
                  onNavigate={onNavigate}
                  copy={copy}
                />
              ) : (
                <UserMessage key={item.id} content={item.content} />
              ),
            )}
            <div ref={endRef} className="ai-thread-end" aria-hidden="true" />
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
        copy={copy}
      />
    </section>
  );
}

function LiveAiConversation({ seedRequest, onNavigate, userId, baseContext, locale }) {
  const assistant = useNovaAssistant({
    userId,
    seedRequest,
    contextBase: {
      page: 'ai',
      market: baseContext?.market,
      assetClass: baseContext?.assetClass,
      timeframe: baseContext?.timeframe,
      locale: baseContext?.locale,
      riskProfileKey: baseContext?.riskProfileKey,
      uiMode: baseContext?.uiMode,
      decisionSummary: baseContext?.decisionSummary,
      holdingsSummary: baseContext?.holdingsSummary,
    },
  });

  return <AiConversationShell {...assistant} onNavigate={onNavigate} locale={locale} />;
}

function DemoAiConversation({ quantState, seedRequest, onNavigate, userId, baseContext, locale }) {
  const copy = useMemo(() => buildAiCopy(locale), [locale]);
  const assistant = useDemoAssistant({
    userId,
    seedRequest,
    demoState: quantState,
    contextBase: {
      page: 'ai',
      market: baseContext?.market,
      assetClass: baseContext?.assetClass,
      timeframe: baseContext?.timeframe,
      locale: baseContext?.locale,
      riskProfileKey: baseContext?.riskProfileKey,
      uiMode: baseContext?.uiMode,
      decisionSummary: baseContext?.decisionSummary,
      holdingsSummary: baseContext?.holdingsSummary,
    },
  });
  const { messages, sendMessage } = assistant;

  useEffect(() => {
    if (seedRequest?.message) return;
    if (messages.length) return;
    void sendMessage(copy.autoQuestion, {
      page: 'today',
      market: baseContext?.market,
      assetClass: baseContext?.assetClass,
    });
  }, [
    seedRequest?.message,
    messages.length,
    sendMessage,
    baseContext?.market,
    baseContext?.assetClass,
    copy.autoQuestion,
  ]);

  return <AiConversationShell {...assistant} onNavigate={onNavigate} locale={locale} />;
}

export default function AiPage({
  quantState,
  seedRequest,
  onNavigate,
  userId,
  baseContext,
  locale,
}) {
  const isDemoMode = Boolean(quantState?.performance?.investor_demo);

  if (isDemoMode) {
    return (
      <DemoAiConversation
        quantState={quantState}
        seedRequest={seedRequest}
        onNavigate={onNavigate}
        userId={userId}
        baseContext={baseContext}
        locale={locale}
      />
    );
  }

  return (
    <LiveAiConversation
      seedRequest={seedRequest}
      onNavigate={onNavigate}
      userId={userId}
      baseContext={baseContext}
      locale={locale}
    />
  );
}

import '../styles/ai-rebuild.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import Skeleton from './Skeleton';
import { useNovaAssistant } from '../hooks/useNovaAssistant';
import { useDemoAssistant } from '../hooks/useDemoAssistant';
import { parseAssistantSectionHeading } from '../utils/assistantLanguage';
import { normalizeMembershipPlan } from '../utils/membership';

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
        ? ['我今天该怎么做？', '现在适合出手吗？', '为什么我们还在等？', '这张卡到底在说什么？']
        : [
            'What should I do today?',
            'Is it safe to try anything?',
            'Why are we waiting?',
            'What is this card really saying?',
          ],
    nextStep: {
      holdings: lang === 'zh' ? '打开持仓' : 'Open Holdings',
      weekly: lang === 'zh' ? '打开周复盘' : 'Open Weekly Review',
      safety: lang === 'zh' ? '打开安全页' : 'Open Safety',
      today: lang === 'zh' ? '回到 Today' : 'Back to Today',
    },
    fallback: {
      showLess: lang === 'zh' ? '收起' : 'Show less',
      showMore: lang === 'zh' ? '展开' : 'Show more',
      hideDetail: lang === 'zh' ? '收起细节' : 'Hide detail',
      showDetail: lang === 'zh' ? '展开细节' : 'Show detail',
    },
    sections: {
      verdict: lang === 'zh' ? '结论' : 'Call',
      plan: lang === 'zh' ? '现在怎么做' : 'What to do now',
      why: lang === 'zh' ? '为什么' : 'Why',
      risk: lang === 'zh' ? '什么情况下不成立' : 'When it breaks',
      evidence: lang === 'zh' ? '依据' : 'Evidence',
    },
    composerPlaceholder: lang === 'zh' ? '直接问我，越白话越好' : 'Ask in plain language',
    emptyBadge: 'Nova',
    emptyHeading:
      lang === 'zh' ? '直接问我今天最重要的事。' : 'Ask the one thing that matters today.',
    emptySubheading:
      lang === 'zh'
        ? '不用写长问题。直接问该不该做、为什么、什么时候失效。'
        : 'Keep it short. Ask what to do, why it matters, or when it stops being valid.',
    autoQuestion: lang === 'zh' ? '我今天该怎么做？' : 'What should I do today?',
    aiError: {
      failed: lang === 'zh' ? '生成回答失败' : 'Failed to generate response',
      preparing:
        lang === 'zh'
          ? '我在准备回答时遇到了一点问题。'
          : 'I hit a problem while preparing an answer.',
    },
  };
}

function buildLinkedContext(seedRequest, locale = 'en-US') {
  const symbol =
    seedRequest?.context?.symbol ||
    seedRequest?.context?.decisionSummary?.top_action_symbol ||
    null;

  if (!symbol) return null;

  const zh = String(locale || '')
    .toLowerCase()
    .startsWith('zh');

  return {
    eyebrow: zh ? '已带入当前标的' : 'Linked setup',
    title: symbol,
    note: zh
      ? '这个标的已经自动带进来了，继续追问就行。'
      : 'This ticker is already attached, so you can keep asking about it.',
    action: zh ? '返回 Today' : 'Back to Today',
  };
}

function buildAccessBadge(plan, remainingAskNova, locale = 'en-US') {
  const zh = String(locale || '')
    .toLowerCase()
    .startsWith('zh');
  const normalizedPlan = normalizeMembershipPlan(plan);

  return {
    planLabel: normalizedPlan === 'pro' ? 'Pro' : normalizedPlan === 'lite' ? 'Lite' : 'Free',
    usageLabel:
      remainingAskNova === null
        ? zh
          ? '高额度'
          : 'High limit'
        : zh
          ? `今日剩余 ${remainingAskNova} 次`
          : `${remainingAskNova} left today`,
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
    <section className="nova-ai-section">
      <p className="nova-ai-section-title">{title}</p>
      <div className="nova-ai-section-body">
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
      <article className="nova-ai-message is-assistant">
        <div className="nova-ai-avatar" aria-hidden="true">
          ✦
        </div>
        <div className="nova-ai-message-body">
          <div className="nova-ai-message-card is-loading">
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
      <article className="nova-ai-message is-assistant">
        <div className="nova-ai-avatar" aria-hidden="true">
          ✦
        </div>
        <div className="nova-ai-message-body">
          <div className="nova-ai-message-card">
            <p className="nova-ai-lead">{lead}</p>
            {visible.map((paragraph, index) => (
              <p key={`fallback-${index}`} className="nova-ai-copy">
                {paragraph}
              </p>
            ))}
            {showToggle ? (
              <button
                type="button"
                className="nova-ai-inline-toggle"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? copy.fallback.showLess : copy.fallback.showMore}
              </button>
            ) : null}
            <div className="nova-ai-card-footer">
              <button
                type="button"
                className="nova-ai-inline-link"
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
    <article className="nova-ai-message is-assistant">
      <div className="nova-ai-avatar" aria-hidden="true">
        ✦
      </div>
      <div className="nova-ai-message-body">
        <div className="nova-ai-message-card">
          <section className="nova-ai-section is-lead">
            <p className="nova-ai-section-title">{copy.sections.verdict}</p>
            <p className="nova-ai-lead">{verdict}</p>
          </section>

          <AssistantResponseSection title={copy.sections.plan} lines={planLines} />
          <AssistantResponseSection title={copy.sections.why} lines={whyLines} />
          <AssistantResponseSection title={copy.sections.risk} lines={riskLines} />

          {hasExtraContent ? (
            <button
              type="button"
              className="nova-ai-inline-toggle"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? copy.fallback.hideDetail : copy.fallback.showDetail}
            </button>
          ) : null}

          {expanded && evidenceLines.length ? (
            <section className="nova-ai-section is-evidence">
              <p className="nova-ai-section-title">{copy.sections.evidence}</p>
              <div className="nova-ai-section-body">
                {evidenceLines.map((line, index) => (
                  <p key={`evidence-${index}`}>{line}</p>
                ))}
              </div>
            </section>
          ) : null}

          <div className="nova-ai-card-footer">
            <button
              type="button"
              className="nova-ai-inline-link"
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
    <article className="nova-ai-message is-user">
      <div className="nova-ai-message-body">
        <div className="nova-ai-user-card">{content}</div>
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
    <div className="nova-ai-dock">
      {!hasMessages ? (
        <div className="nova-ai-suggestions" aria-label="Suggested prompts">
          {copy.quickQuestions.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="nova-ai-suggestion"
              onClick={() => setInput(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="nova-ai-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSend) return;
          void sendMessage(input);
        }}
      >
        <div className="nova-ai-composer-field">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="nova-ai-input"
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
          <button type="submit" className="nova-ai-send" disabled={!canSend}>
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
  linkedContext,
  membershipPlan,
  remainingAskNova,
}) {
  const listRef = useRef(null);
  const endRef = useRef(null);
  const hasMessages = messages.length > 0;
  const copy = useMemo(() => buildAiCopy(locale), [locale]);
  const accessBadge = useMemo(
    () => buildAccessBadge(membershipPlan, remainingAskNova, locale),
    [locale, membershipPlan, remainingAskNova],
  );

  useEffect(() => {
    if (!listRef.current || !hasMessages) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const thread = listRef.current;
      thread.scrollTop = thread.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hasMessages, messages, streaming]);

  return (
    <section className={`nova-ai-page ${hasMessages ? 'has-thread' : 'is-empty'}`}>
      <div className="nova-ai-top">
        {linkedContext ? (
          <section className="nova-ai-context">
            <div className="nova-ai-context-copy">
              <p className="nova-ai-context-eyebrow">{linkedContext.eyebrow}</p>
              <p className="nova-ai-context-title">{linkedContext.title}</p>
              <p className="nova-ai-context-note">{linkedContext.note}</p>
            </div>
            <button
              type="button"
              className="nova-ai-context-action"
              onClick={() => onNavigate?.('today')}
            >
              {linkedContext.action}
            </button>
          </section>
        ) : null}

        <section className="nova-ai-hero">
          <div className="nova-ai-hero-mark" aria-hidden="true">
            ✦
          </div>
          <div className="nova-ai-hero-copy">
            <p className="nova-ai-kicker">{copy.emptyBadge}</p>
            <h1 className="nova-ai-title">{copy.emptyHeading}</h1>
            <p className="nova-ai-subtitle">{copy.emptySubheading}</p>
          </div>
        </section>

        <div className="nova-ai-meta" aria-label={copy.emptyBadge}>
          <span className="nova-ai-plan">{accessBadge.planLabel}</span>
          <span className="nova-ai-usage">{accessBadge.usageLabel}</span>
        </div>
      </div>

      <div className="nova-ai-scroll" ref={listRef}>
        {hasMessages ? (
          <div className="nova-ai-thread">
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
            <div ref={endRef} className="nova-ai-thread-end" aria-hidden="true" />
          </div>
        ) : (
          <div className="nova-ai-void" aria-hidden="true" />
        )}
      </div>

      {error ? (
        <div className="nova-ai-error" role="status">
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

function LiveAiConversation({
  seedRequest,
  onNavigate,
  userId,
  baseContext,
  locale,
  membershipPlan,
  remainingAskNova,
  onRequestAiAccess,
}) {
  const linkedContext = useMemo(
    () => buildLinkedContext(seedRequest, locale),
    [seedRequest, locale],
  );
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

  const guardedSendMessage = useMemo(
    () =>
      async (rawText, contextOverride = {}) => {
        if (
          onRequestAiAccess &&
          !onRequestAiAccess(rawText, {
            ...(contextOverride || {}),
          })
        ) {
          return;
        }
        return assistant.sendMessage(rawText, contextOverride);
      },
    [assistant, onRequestAiAccess],
  );

  return (
    <AiConversationShell
      {...assistant}
      sendMessage={guardedSendMessage}
      onNavigate={onNavigate}
      locale={locale}
      linkedContext={linkedContext}
      membershipPlan={membershipPlan}
      remainingAskNova={remainingAskNova}
    />
  );
}

function DemoAiConversation({
  quantState,
  seedRequest,
  onNavigate,
  userId,
  baseContext,
  locale,
  membershipPlan,
  remainingAskNova,
  onRequestAiAccess,
}) {
  const copy = useMemo(() => buildAiCopy(locale), [locale]);
  const linkedContext = useMemo(
    () => buildLinkedContext(seedRequest, locale),
    [seedRequest, locale],
  );
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

  const guardedSendMessage = useMemo(
    () =>
      async (rawText, contextOverride = {}) => {
        if (
          onRequestAiAccess &&
          !onRequestAiAccess(rawText, {
            ...(contextOverride || {}),
          })
        ) {
          return;
        }
        return sendMessage(rawText, contextOverride);
      },
    [onRequestAiAccess, sendMessage],
  );

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

  return (
    <AiConversationShell
      {...assistant}
      sendMessage={guardedSendMessage}
      onNavigate={onNavigate}
      locale={locale}
      linkedContext={linkedContext}
      membershipPlan={membershipPlan}
      remainingAskNova={remainingAskNova}
    />
  );
}

export default function AiPage({
  quantState,
  seedRequest,
  onNavigate,
  userId,
  baseContext,
  locale,
  membershipPlan = 'free',
  remainingAskNova = 0,
  onRequestAiAccess,
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
        membershipPlan={membershipPlan}
        remainingAskNova={remainingAskNova}
        onRequestAiAccess={onRequestAiAccess}
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
      membershipPlan={membershipPlan}
      remainingAskNova={remainingAskNova}
      onRequestAiAccess={onRequestAiAccess}
    />
  );
}

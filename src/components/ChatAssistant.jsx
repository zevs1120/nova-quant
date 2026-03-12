import { useEffect, useMemo, useRef, useState } from 'react';

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ChatAssistant({ open, onClose, userId, seed, t }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);

  const suggestions = useMemo(
    () => [
      t('chat.suggest.quantBasics'),
      t('chat.suggest.riskSizing'),
      t('chat.suggest.executeChecklist')
    ],
    [t]
  );

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, streaming]);

  useEffect(() => {
    if (!open || !seed?.id || !seed?.message) return;
    void sendMessage(seed.message, seed.context);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed?.id]);

  const appendAssistantChunk = (id, delta) => {
    setMessages((current) =>
      current.map((item) =>
        item.id === id ? { ...item, content: `${item.content}${delta}` } : item
      )
    );
  };

  const sendMessage = async (rawMessage, context) => {
    const text = String(rawMessage || '').trim();
    if (!text || streaming) return;

    setError('');
    setStreaming(true);

    const userMsg = { id: randomId(), role: 'user', content: text };
    const assistantId = randomId();
    const assistantMsg = { id: assistantId, role: 'assistant', content: '' };

    setMessages((current) => [...current, userMsg, assistantMsg]);
    setInput('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          message: text,
          context
        })
      });

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(errPayload.error || `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body from /api/chat');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop() || '';

        for (const line of parts) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const event = JSON.parse(trimmed);
            if (event.type === 'chunk' && event.delta) {
              appendAssistantChunk(assistantId, event.delta);
            }
            if (event.type === 'error') {
              setError(event.error || t('chat.errorFallback'));
            }
          } catch {
            // Ignore malformed stream event.
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('chat.errorFallback');
      setError(msg);
      appendAssistantChunk(assistantId, `${t('chat.errorPrefix')} ${msg}`);
    } finally {
      setStreaming(false);
    }
  };

  if (!open) return null;

  return (
    <div className="chat-overlay" role="presentation" onClick={onClose}>
      <section className="chat-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header className="chat-header">
          <h3 className="card-title">{t('chat.title')}</h3>
          <button type="button" className="ghost-btn" onClick={onClose}>
            {t('chat.close')}
          </button>
        </header>

        <div className="chat-body" ref={listRef}>
          {!messages.length ? (
            <article className="chat-empty">
              <p className="muted">{t('chat.emptyHint')}</p>
              <div className="chat-suggest-row">
                {suggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="chat-suggest-btn"
                    onClick={() => {
                      void sendMessage(item);
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </article>
          ) : (
            <div className="chat-thread">
              {messages.map((msg) => (
                <article key={msg.id} className={`chat-bubble chat-${msg.role}`}>
                  {msg.content || (msg.role === 'assistant' && streaming ? t('chat.thinking') : '')}
                </article>
              ))}
            </div>
          )}
        </div>

        {error ? <p className="chat-error">{error}</p> : null}

        <form
          className="chat-input-row"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage(input);
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="chat-input"
            placeholder={t('chat.placeholder')}
            disabled={streaming}
          />
          <button type="submit" className="primary-btn chat-send" disabled={streaming || !input.trim()}>
            {streaming ? t('chat.sending') : t('chat.send')}
          </button>
        </form>
      </section>
    </div>
  );
}

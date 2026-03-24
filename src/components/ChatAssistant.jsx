import { useEffect, useMemo, useRef } from 'react';
import { useNovaAssistant } from '../hooks/useNovaAssistant';

export default function ChatAssistant({ open, onClose, userId, seed, t }) {
  const listRef = useRef(null);
  const { messages, input, setInput, streaming, error, sendMessage } = useNovaAssistant({
    userId,
    seedRequest: seed,
    contextBase: {
      page: 'ai',
    },
  });

  const suggestions = useMemo(
    () => [
      t('chat.suggest.quantBasics'),
      t('chat.suggest.riskSizing'),
      t('chat.suggest.executeChecklist'),
    ],
    [t],
  );

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, streaming]);
  if (!open) return null;

  return (
    <div className="chat-overlay" role="presentation" onClick={onClose}>
      <section
        className="chat-sheet"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
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
          <button
            type="submit"
            className="primary-btn chat-send"
            disabled={streaming || !input.trim()}
          >
            {streaming ? t('chat.sending') : t('chat.send')}
          </button>
        </form>
      </section>
    </div>
  );
}

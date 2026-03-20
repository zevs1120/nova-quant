import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { detectMessageLanguage } from '../utils/assistantLanguage';

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `${url} failed (${response.status})`);
  }
  return response.json();
}

function normalizeMessages(rows = []) {
  return rows.map((row) => ({
    id: row.id || randomId(),
    role: row.role,
    content: row.content,
    provider: row.provider || null
  }));
}

export function useNovaAssistant({ userId, seedRequest, contextBase }) {
  const storageKey = useMemo(() => `nova-quant-chat-thread:${userId}`, [userId]);
  const [activeThreadId, setActiveThreadId] = useLocalStorage(storageKey, '');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const seededRef = useRef(null);
  const bootedRef = useRef(false);

  const loadThread = useCallback(
    async (threadId) => {
      if (!threadId || !userId) return;
      const payload = await fetchJson(`/api/chat/threads/${threadId}?userId=${encodeURIComponent(userId)}&limit=40`);
      setMessages(normalizeMessages(payload.messages || []));
      setActiveThreadId(threadId);
    },
    [userId, setActiveThreadId]
  );

  useEffect(() => {
    let mounted = true;
    if (!userId || bootedRef.current) return;
    bootedRef.current = true;

    (async () => {
      try {
        if (activeThreadId) {
          await loadThread(activeThreadId);
          return;
        }
        const payload = await fetchJson(`/api/chat/threads?userId=${encodeURIComponent(userId)}&limit=1`);
        const first = payload.data?.[0];
        if (mounted && first?.id) {
          await loadThread(first.id);
        }
      } catch {
        // Best-effort restore only.
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId, activeThreadId, loadThread]);

  const sendMessage = useCallback(
    async (rawText, contextOverride = {}) => {
      const text = String(rawText || '').trim();
      if (!text || streaming || !userId) return;
      const language = detectMessageLanguage(text, contextBase?.locale || 'en');

      setError('');
      setStreaming(true);
      setInput('');

      const assistantId = randomId();
      setMessages((current) => [
        ...current,
        { id: randomId(), role: 'user', content: text },
        { id: assistantId, role: 'assistant', content: '', question: text }
      ]);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId,
            threadId: activeThreadId || undefined,
            message: text,
            context: {
              ...(contextBase || {}),
              ...(contextOverride || {})
            }
          })
        });

        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const appendChunk = (delta) => {
          setMessages((current) =>
            current.map((item) => (item.id === assistantId ? { ...item, content: `${item.content}${delta}` } : item))
          );
        };

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
              if (event.type === 'meta' && event.threadId) {
                setActiveThreadId(event.threadId);
                setMessages((current) =>
                  current.map((item) =>
                    item.id === assistantId ? { ...item, provider: event.provider || null } : item
                  )
                );
              }
              if (event.type === 'chunk' && event.delta) {
                appendChunk(event.delta);
              }
              if (event.type === 'error') {
                setError(language === 'zh' ? `生成回答失败：${event.error || '请稍后重试。'}` : event.error || 'Failed to generate response');
              }
            } catch {
              // Ignore malformed stream chunks.
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate response';
        setError(language === 'zh' ? `生成回答失败：${message}` : message);
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId
              ? { ...item, content: language === 'zh' ? `我在准备回答时遇到了一点问题。\n\n${message}` : `I hit a problem while preparing an answer.\n\n${message}` }
              : item
          )
        );
      } finally {
        setStreaming(false);
      }
    },
    [activeThreadId, contextBase, streaming, userId, setActiveThreadId]
  );

  useEffect(() => {
    if (!seedRequest?.id || !seedRequest?.message) return;
    if (seededRef.current === seedRequest.id) return;
    seededRef.current = seedRequest.id;
    void sendMessage(seedRequest.message, seedRequest.context);
  }, [seedRequest, sendMessage]);

  return {
    messages,
    input,
    setInput,
    streaming,
    error,
    activeThreadId,
    sendMessage,
    loadThread
  };
}

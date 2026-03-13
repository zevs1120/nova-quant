import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { buildDemoAssistantReply } from '../demo/demoAssistant';

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeStoredMessages(rows = []) {
  return Array.isArray(rows)
    ? rows
        .filter((row) => row && typeof row === 'object')
        .map((row) => ({
          id: row.id || randomId(),
          role: row.role === 'assistant' ? 'assistant' : 'user',
          content: String(row.content || ''),
          provider: row.provider || (row.role === 'assistant' ? 'demo-offline' : null),
          question: row.question || null
        }))
    : [];
}

export function useDemoAssistant({ userId, seedRequest, contextBase, demoState }) {
  const storageKey = `nova-quant-demo-chat:${userId}`;
  const [storedMessages, setStoredMessages] = useLocalStorage(storageKey, []);
  const [messages, setMessages] = useState(() => normalizeStoredMessages(storedMessages));
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const seededRef = useRef(null);

  useEffect(() => {
    setMessages(normalizeStoredMessages(storedMessages));
  }, [storedMessages]);

  const sendMessage = useCallback(
    async (rawText, contextOverride = {}) => {
      const text = String(rawText || '').trim();
      if (!text || streaming) return;

      setError('');
      setStreaming(true);
      setInput('');

      const nextMessages = [
        ...messages,
        { id: randomId(), role: 'user', content: text, provider: null },
        {
          id: randomId(),
          role: 'assistant',
          content: buildDemoAssistantReply(text, demoState, {
            ...(contextBase || {}),
            ...(contextOverride || {})
          }),
          provider: 'demo-offline',
          question: text
        }
      ].slice(-24);

      setMessages(nextMessages);
      setStoredMessages(nextMessages);
      setStreaming(false);
    },
    [contextBase, demoState, messages, setStoredMessages, streaming]
  );

  useEffect(() => {
    if (!seedRequest?.id || !seedRequest?.message) return;
    if (seededRef.current === seedRequest.id) return;
    seededRef.current = seedRequest.id;
    void sendMessage(seedRequest.message, seedRequest.context);
  }, [seedRequest, sendMessage]);

  const loadThread = useCallback(async () => {}, []);

  return {
    messages,
    input,
    setInput,
    streaming,
    error,
    activeThreadId: 'demo-offline-thread',
    sendMessage,
    loadThread
  };
}

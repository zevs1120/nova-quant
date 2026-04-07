import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { detectMessageLanguage } from '../utils/assistantLanguage';
import { fetchApi, fetchApiJson } from '../utils/api';

const CHAT_THREAD_STORAGE_TTL_MS = 1000 * 60 * 60 * 12;
const CHAT_THREAD_FRESH_MS = 1000 * 60 * 2;
const CHAT_THREAD_CACHE_PREFIX = 'nova-quant-chat-thread-cache';
const CHAT_THREAD_LATEST_PREFIX = 'nova-quant-chat-thread-latest';
const INITIAL_THREAD_MESSAGE_LIMIT = 3;
const FULL_THREAD_MESSAGE_LIMIT = 10;
const chatThreadMemoryCache = new Map();
const latestThreadMemoryCache = new Map();

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeMessages(rows = []) {
  return rows.map((row) => ({
    id: row.id || randomId(),
    role: row.role,
    content: row.content,
    provider: row.provider || null,
  }));
}

function nowMs() {
  return Date.now();
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function buildThreadCacheKey(userId, threadId) {
  return `${String(userId || 'guest-default').trim() || 'guest-default'}:${String(threadId || '').trim()}`;
}

function buildThreadStorageKey(cacheKey) {
  return `${CHAT_THREAD_CACHE_PREFIX}:${cacheKey}`;
}

function buildLatestStorageKey(userId) {
  return `${CHAT_THREAD_LATEST_PREFIX}:${String(userId || 'guest-default').trim() || 'guest-default'}`;
}

function writeLatestThreadPointer(userId, threadId) {
  const normalizedUserId = String(userId || 'guest-default').trim() || 'guest-default';
  const normalizedThreadId = String(threadId || '').trim();
  if (!normalizedThreadId) return;
  latestThreadMemoryCache.set(normalizedUserId, normalizedThreadId);
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(buildLatestStorageKey(normalizedUserId), normalizedThreadId);
  } catch {
    // ignore storage failures
  }
}

function readLatestThreadPointer(userId) {
  const normalizedUserId = String(userId || 'guest-default').trim() || 'guest-default';
  const memory = latestThreadMemoryCache.get(normalizedUserId);
  if (memory) return memory;
  if (!canUseStorage()) return '';
  try {
    const stored = window.localStorage.getItem(buildLatestStorageKey(normalizedUserId)) || '';
    if (stored) latestThreadMemoryCache.set(normalizedUserId, stored);
    return stored;
  } catch {
    return '';
  }
}

function readThreadSnapshot(userId, threadId) {
  const cacheKey = buildThreadCacheKey(userId, threadId);
  if (!cacheKey.endsWith(':') && chatThreadMemoryCache.has(cacheKey)) {
    const memory = chatThreadMemoryCache.get(cacheKey);
    if (memory && memory.savedAt + CHAT_THREAD_STORAGE_TTL_MS >= nowMs()) {
      return memory;
    }
  }
  if (!canUseStorage() || !threadId) return null;
  try {
    const raw = window.localStorage.getItem(buildThreadStorageKey(cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    if (parsed.savedAt + CHAT_THREAD_STORAGE_TTL_MS < nowMs()) {
      window.localStorage.removeItem(buildThreadStorageKey(cacheKey));
      return null;
    }
    chatThreadMemoryCache.set(cacheKey, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function readLatestThreadSnapshot(userId) {
  const latestThreadId = readLatestThreadPointer(userId);
  if (!latestThreadId) return null;
  return readThreadSnapshot(userId, latestThreadId);
}

function writeThreadSnapshot(userId, threadId, messages, options = {}) {
  const normalizedThreadId = String(threadId || '').trim();
  if (!userId || !normalizedThreadId || !Array.isArray(messages) || !messages.length) return;
  const cacheKey = buildThreadCacheKey(userId, normalizedThreadId);
  const normalizedMessages = normalizeMessages(messages);
  const payload = {
    savedAt: nowMs(),
    threadId: normalizedThreadId,
    messages: normalizedMessages,
    hasMore: Boolean(options.hasMore),
    historyLimit: Math.max(
      1,
      Number(options.historyLimit || normalizedMessages.length || INITIAL_THREAD_MESSAGE_LIMIT),
    ),
  };
  chatThreadMemoryCache.set(cacheKey, payload);
  writeLatestThreadPointer(userId, normalizedThreadId);
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(buildThreadStorageKey(cacheKey), JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
}

function isFreshThreadSnapshot(snapshot) {
  return Boolean(snapshot?.savedAt) && snapshot.savedAt + CHAT_THREAD_FRESH_MS >= nowMs();
}

export function __resetNovaAssistantThreadCacheForTesting() {
  chatThreadMemoryCache.clear();
  latestThreadMemoryCache.clear();
  if (!canUseStorage()) return;
  try {
    Object.keys(window.localStorage)
      .filter(
        (key) =>
          key.startsWith(`${CHAT_THREAD_CACHE_PREFIX}:`) ||
          key.startsWith(`${CHAT_THREAD_LATEST_PREFIX}:`),
      )
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore storage failures
  }
}

export function useNovaAssistant({ userId, seedRequest, contextBase }) {
  const storageKey = useMemo(() => `nova-quant-chat-thread:${userId}`, [userId]);
  const [activeThreadId, setActiveThreadId] = useLocalStorage(storageKey, '');
  const [messages, setMessages] = useState(() => {
    if (!userId) return [];
    const cached = activeThreadId
      ? readThreadSnapshot(userId, activeThreadId)
      : readLatestThreadSnapshot(userId);
    return Array.isArray(cached?.messages) ? cached.messages : [];
  });
  const [hasOlderMessages, setHasOlderMessages] = useState(() => {
    if (!userId) return false;
    const cached = activeThreadId
      ? readThreadSnapshot(userId, activeThreadId)
      : readLatestThreadSnapshot(userId);
    return Boolean(cached?.hasMore);
  });
  const [historyLimit, setHistoryLimit] = useState(() => {
    if (!userId) return INITIAL_THREAD_MESSAGE_LIMIT;
    const cached = activeThreadId
      ? readThreadSnapshot(userId, activeThreadId)
      : readLatestThreadSnapshot(userId);
    return Math.max(
      1,
      Number(cached?.historyLimit || cached?.messages?.length || INITIAL_THREAD_MESSAGE_LIMIT),
    );
  });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const seededRef = useRef(null);
  const bootedUserRef = useRef('');
  const shouldSkipNetworkRestore = Boolean(seedRequest?.id && seedRequest?.message);

  const loadThread = useCallback(
    async (threadId, options = {}) => {
      if (!threadId || !userId) return;
      const limit = Math.max(1, Number(options.limit) || FULL_THREAD_MESSAGE_LIMIT);
      const payload = await fetchApiJson(
        `/api/chat/threads/${threadId}?userId=${encodeURIComponent(userId)}&limit=${limit}`,
      );
      const nextMessages = normalizeMessages(payload.messages || []);
      setMessages(nextMessages);
      setActiveThreadId(threadId);
      setHasOlderMessages(Boolean(payload?.hasMore));
      setHistoryLimit(limit);
      writeThreadSnapshot(userId, threadId, nextMessages, {
        hasMore: Boolean(payload?.hasMore),
        historyLimit: limit,
      });
      return payload;
    },
    [userId, setActiveThreadId],
  );

  useEffect(() => {
    let mounted = true;
    if (!userId || bootedUserRef.current === userId) return;
    bootedUserRef.current = userId;

    (async () => {
      try {
        const cachedSnapshot = activeThreadId
          ? readThreadSnapshot(userId, activeThreadId)
          : readLatestThreadSnapshot(userId);
        if (mounted && Array.isArray(cachedSnapshot?.messages) && cachedSnapshot.messages.length) {
          setMessages(cachedSnapshot.messages);
          setHasOlderMessages(Boolean(cachedSnapshot.hasMore));
          setHistoryLimit(
            Math.max(
              1,
              Number(
                cachedSnapshot.historyLimit ||
                  cachedSnapshot.messages.length ||
                  INITIAL_THREAD_MESSAGE_LIMIT,
              ),
            ),
          );
          if (!activeThreadId && cachedSnapshot.threadId) {
            setActiveThreadId(cachedSnapshot.threadId);
          }
          if (isFreshThreadSnapshot(cachedSnapshot)) {
            return;
          }
        }

        if (shouldSkipNetworkRestore) {
          return;
        }

        if (activeThreadId) {
          await loadThread(activeThreadId, { limit: INITIAL_THREAD_MESSAGE_LIMIT });
          return;
        }
        const payload = await fetchApiJson(
          `/api/chat/restore-latest?userId=${encodeURIComponent(userId)}&messageLimit=${INITIAL_THREAD_MESSAGE_LIMIT}`,
        );
        const restoredThread = payload?.restored?.thread || null;
        const restoredMessages = normalizeMessages(payload?.restored?.messages || []);
        if (mounted && restoredThread?.id) {
          setMessages(restoredMessages);
          setActiveThreadId(restoredThread.id);
          setHasOlderMessages(Boolean(payload?.restored?.hasMore));
          setHistoryLimit(INITIAL_THREAD_MESSAGE_LIMIT);
          writeThreadSnapshot(userId, restoredThread.id, restoredMessages, {
            hasMore: Boolean(payload?.restored?.hasMore),
            historyLimit: INITIAL_THREAD_MESSAGE_LIMIT,
          });
          return;
        }
        const first = payload?.data?.[0];
        if (mounted && first?.id) {
          await loadThread(first.id, { limit: INITIAL_THREAD_MESSAGE_LIMIT });
        }
      } catch {
        // Best-effort restore only.
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId, activeThreadId, loadThread, shouldSkipNetworkRestore]);

  useEffect(() => {
    if (!userId || !activeThreadId || !messages.length) return;
    writeThreadSnapshot(userId, activeThreadId, messages, {
      hasMore: hasOlderMessages,
      historyLimit,
    });
  }, [activeThreadId, hasOlderMessages, historyLimit, messages, userId]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeThreadId || loadingHistory || !hasOlderMessages) return;
    const nextLimit = Math.max(FULL_THREAD_MESSAGE_LIMIT, historyLimit);
    setLoadingHistory(true);
    try {
      await loadThread(activeThreadId, { limit: nextLimit });
    } finally {
      setLoadingHistory(false);
    }
  }, [activeThreadId, hasOlderMessages, historyLimit, loadThread, loadingHistory]);

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
        { id: assistantId, role: 'assistant', content: '', question: text },
      ]);

      try {
        const response = await fetchApi('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            userId,
            threadId: activeThreadId || undefined,
            message: text,
            context: {
              ...(contextBase || {}),
              ...(contextOverride || {}),
            },
          }),
        });

        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const appendChunk = (delta) => {
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantId ? { ...item, content: `${item.content}${delta}` } : item,
            ),
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
                    item.id === assistantId ? { ...item, provider: event.provider || null } : item,
                  ),
                );
              }
              if (event.type === 'chunk' && event.delta) {
                appendChunk(event.delta);
              }
              if (event.type === 'error') {
                setError(
                  language === 'zh'
                    ? `生成回答失败：${event.error || '请稍后重试。'}`
                    : event.error || 'Failed to generate response',
                );
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
              ? {
                  ...item,
                  content:
                    language === 'zh'
                      ? `我在准备回答时遇到了一点问题。\n\n${message}`
                      : `I hit a problem while preparing an answer.\n\n${message}`,
                }
              : item,
          ),
        );
      } finally {
        setStreaming(false);
      }
    },
    [activeThreadId, contextBase, streaming, userId, setActiveThreadId],
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
    hasOlderMessages,
    loadingHistory,
    loadOlderMessages,
    sendMessage,
    loadThread,
  };
}

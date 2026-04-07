// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetNovaAssistantThreadCacheForTesting,
  useNovaAssistant,
} from '../../src/hooks/useNovaAssistant.js';

const fetchApiJson = vi.hoisted(() => vi.fn());
const fetchApi = vi.hoisted(() => vi.fn());

vi.mock('../../src/utils/api.js', () => ({
  fetchApi,
  fetchApiJson,
}));

describe('useNovaAssistant', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetNovaAssistantThreadCacheForTesting();
  });

  afterEach(() => {
    vi.clearAllMocks();
    __resetNovaAssistantThreadCacheForTesting();
  });

  it('streams assistant chunks into message list', async () => {
    fetchApiJson.mockImplementation(async (url: string) => {
      if (String(url).includes('/threads?')) return { data: [], restored: null };
      return { messages: [] };
    });

    const encoder = new TextEncoder();
    fetchApi.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({ type: 'meta', threadId: 't1', provider: 'test' })}\n`,
              ),
            );
            controller.enqueue(
              encoder.encode(`${JSON.stringify({ type: 'chunk', delta: 'hi' })}\n`),
            );
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() =>
      useNovaAssistant({
        userId: 'u-stream',
        seedRequest: null,
        contextBase: { locale: 'en' },
      }),
    );

    await waitFor(() => expect(fetchApiJson).toHaveBeenCalled());

    await act(async () => {
      await result.current.sendMessage('ping');
    });

    await waitFor(() => {
      const assistant = result.current.messages
        .filter((m: { role: string }) => m.role === 'assistant')
        .pop();
      expect(String(assistant?.content || '')).toContain('hi');
    });
    expect(result.current.streaming).toBe(false);
  });

  it('restores the latest thread with a single hydrate request', async () => {
    fetchApiJson.mockResolvedValue({
      restored: {
        thread: { id: 'thread-latest' },
        hasMore: false,
        messages: [
          { id: 'm1', role: 'user', content: 'hello' },
          { id: 'm2', role: 'assistant', content: 'world' },
        ],
      },
    });

    const { result } = renderHook(() =>
      useNovaAssistant({
        userId: 'u-restore',
        seedRequest: null,
        contextBase: { locale: 'en' },
      }),
    );

    await waitFor(() => expect(result.current.activeThreadId).toBe('thread-latest'));
    expect(fetchApiJson).toHaveBeenCalledTimes(1);
    expect(fetchApiJson).toHaveBeenCalledWith(
      '/api/chat/restore-latest?userId=u-restore&messageLimit=3',
    );
    expect(result.current.messages.map((row: { content: string }) => row.content)).toEqual([
      'hello',
      'world',
    ]);
  });

  it('reuses a fresh cached thread snapshot without fetching', async () => {
    localStorage.setItem('nova-quant-chat-thread:u-cache', 'thread-cache-1');
    localStorage.setItem('nova-quant-chat-thread-latest:u-cache', 'thread-cache-1');
    localStorage.setItem(
      'nova-quant-chat-thread-cache:u-cache:thread-cache-1',
      JSON.stringify({
        savedAt: Date.now(),
        threadId: 'thread-cache-1',
        messages: [
          { id: 'm1', role: 'user', content: 'cached question' },
          { id: 'm2', role: 'assistant', content: 'cached answer' },
        ],
        hasMore: true,
        historyLimit: 3,
      }),
    );

    const { result } = renderHook(() =>
      useNovaAssistant({
        userId: 'u-cache',
        seedRequest: null,
        contextBase: { locale: 'en' },
      }),
    );

    await waitFor(() => expect(result.current.messages.length).toBe(2));
    expect(result.current.activeThreadId).toBe('thread-cache-1');
    expect(fetchApiJson).not.toHaveBeenCalled();
  });

  it('loads older messages on demand instead of restoring the full history by default', async () => {
    fetchApiJson
      .mockResolvedValueOnce({
        restored: {
          thread: { id: 'thread-history' },
          hasMore: true,
          messages: Array.from({ length: 3 }, (_, index) => ({
            id: `m-${index + 1}`,
            role: index % 2 === 0 ? 'user' : 'assistant',
            content: `msg-${index + 1}`,
          })),
        },
      })
      .mockResolvedValueOnce({
        thread: { id: 'thread-history' },
        hasMore: false,
        messages: Array.from({ length: 10 }, (_, index) => ({
          id: `m-full-${index + 1}`,
          role: index % 2 === 0 ? 'user' : 'assistant',
          content: `full-${index + 1}`,
        })),
      });

    const { result } = renderHook(() =>
      useNovaAssistant({
        userId: 'u-history',
        seedRequest: null,
        contextBase: { locale: 'en' },
      }),
    );

    await waitFor(() => expect(result.current.activeThreadId).toBe('thread-history'));
    expect(result.current.hasOlderMessages).toBe(true);

    await act(async () => {
      await result.current.loadOlderMessages();
    });

    expect(fetchApiJson).toHaveBeenNthCalledWith(
      2,
      '/api/chat/threads/thread-history?userId=u-history&limit=10',
    );
    expect(result.current.hasOlderMessages).toBe(false);
    expect(result.current.messages).toHaveLength(10);
  });

  it('skips network restore when entering with a seed request', async () => {
    const encoder = new TextEncoder();
    fetchApi.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({ type: 'meta', threadId: 'seed-thread', provider: 'test' })}\n`,
              ),
            );
            controller.enqueue(
              encoder.encode(`${JSON.stringify({ type: 'chunk', delta: 'seeded' })}\n`),
            );
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() =>
      useNovaAssistant({
        userId: 'u-seed',
        seedRequest: {
          id: 'seed-1',
          message: 'Explain this setup',
          context: { symbol: 'SPY' },
        },
        contextBase: { locale: 'en' },
      }),
    );

    await waitFor(() => expect(fetchApi).toHaveBeenCalledTimes(1));
    expect(fetchApiJson).not.toHaveBeenCalled();
    await waitFor(() => {
      const assistant = result.current.messages
        .filter((m: { role: string }) => m.role === 'assistant')
        .pop();
      expect(String(assistant?.content || '')).toContain('seeded');
    });
  });
});

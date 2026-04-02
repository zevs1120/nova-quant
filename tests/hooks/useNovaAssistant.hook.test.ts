// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNovaAssistant } from '../../src/hooks/useNovaAssistant.js';

const fetchApiJson = vi.hoisted(() => vi.fn());
const fetchApi = vi.hoisted(() => vi.fn());

vi.mock('../../src/utils/api.js', () => ({
  fetchApi,
  fetchApiJson,
}));

describe('useNovaAssistant', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('streams assistant chunks into message list', async () => {
    fetchApiJson.mockImplementation(async (url: string) => {
      if (String(url).includes('/threads?')) return { data: [] };
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
});

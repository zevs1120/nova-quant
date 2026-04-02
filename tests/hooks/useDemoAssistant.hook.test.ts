// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDemoAssistant } from '../../src/hooks/useDemoAssistant.js';

describe('useDemoAssistant', () => {
  it('sendMessage appends user and assistant rows', async () => {
    const { result } = renderHook(() =>
      useDemoAssistant({
        userId: 'guest-1',
        seedRequest: null,
        contextBase: { locale: 'en' },
        demoState: {},
      }),
    );
    await act(async () => {
      await result.current.sendMessage('hello demo');
    });
    expect(
      result.current.messages.some(
        (m: { role: string; content: string }) => m.role === 'user' && m.content === 'hello demo',
      ),
    ).toBe(true);
    expect(result.current.messages.some((m: { role: string }) => m.role === 'assistant')).toBe(
      true,
    );
    expect(result.current.streaming).toBe(false);
  });

  it('ignores whitespace-only sendMessage', async () => {
    const { result } = renderHook(() =>
      useDemoAssistant({
        userId: 'guest-2',
        seedRequest: null,
        contextBase: {},
        demoState: {},
      }),
    );
    await act(async () => {
      await result.current.sendMessage('   ');
    });
    expect(result.current.messages.length).toBe(0);
  });
});

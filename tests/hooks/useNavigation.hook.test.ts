// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useNavigation } from '../../src/hooks/useNavigation.js';

describe('useNavigation', () => {
  it('defaults to today tab and watchlist stack', () => {
    const { result } = renderHook(() => useNavigation());
    expect(result.current.activeTab).toBe('today');
    expect(result.current.myStack).toEqual(['watchlist']);
    expect(result.current.mySection).toBe('watchlist');
  });

  it('openMySection builds stack for menu and grouped sections', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => result.current.openMySection('menu'));
    expect(result.current.activeTab).toBe('my');
    expect(result.current.myStack).toEqual(['watchlist', 'menu']);

    act(() => result.current.openMySection('group:alpha'));
    expect(result.current.myStack).toEqual(['watchlist', 'menu', 'group:alpha']);
  });

  it('pushMySection dedupes top and popMySection shrinks', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => result.current.pushMySection('settings'));
    act(() => result.current.pushMySection('settings'));
    expect(result.current.myStack[result.current.myStack.length - 1]).toBe('settings');
    act(() => result.current.popMySection());
    expect(result.current.myStack).toEqual(['watchlist']);
  });

  it('askAi ignores empty message', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => result.current.askAi('  '));
    expect(result.current.activeTab).toBe('today');
    expect(result.current.aiSeedRequest).toBe(null);
  });

  it('askAi switches to ai with context from my tab', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => result.current.openMySection('holdings'));
    act(() => result.current.askAi('why flat', {}, { locale: 'en' }));
    expect(result.current.activeTab).toBe('ai');
    expect(result.current.aiSeedRequest?.message).toBe('why flat');
    expect(result.current.aiSeedRequest?.context.page).toBe('holdings');
  });

  it('navigateFromAi routes watchlist and more targets', () => {
    const { result } = renderHook(() => useNavigation());
    // 验证旧的 holdings 目标现在路由到 watchlist
    act(() => result.current.navigateFromAi('holdings'));
    expect(result.current.activeTab).toBe('my');
    expect(result.current.myStack).toEqual(['watchlist']);

    // 验证显式的 watchlist 目标
    act(() => result.current.navigateFromAi('watchlist'));
    expect(result.current.activeTab).toBe('watchlist');
    expect(result.current.myStack).toEqual(['watchlist']);

    act(() => result.current.navigateFromAi('more'));
    expect(result.current.activeTab).toBe('my');
    expect(result.current.mySection).toBe('menu');
  });

  it('resetMy clears stack', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => result.current.openMySection('menu'));
    act(() => result.current.resetMy());
    expect(result.current.myStack).toEqual(['watchlist']);
  });
});

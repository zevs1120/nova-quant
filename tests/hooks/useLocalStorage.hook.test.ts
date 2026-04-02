// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readLocalStorageWithMigration, useLocalStorage } from '../../src/hooks/useLocalStorage.js';

describe('useLocalStorage', () => {
  it('reads initial value from storage', () => {
    localStorage.setItem('k', JSON.stringify({ x: 1 }));
    const { result } = renderHook(() => useLocalStorage('k', {}));
    expect(result.current[0]).toEqual({ x: 1 });
  });

  it('persists updates to storage', () => {
    const { result } = renderHook(() => useLocalStorage('persist-me', 0));
    act(() => result.current[1](42));
    expect(JSON.parse(localStorage.getItem('persist-me') || 'null')).toBe(42);
  });

  it('readLocalStorageWithMigration migrates legacy key', () => {
    localStorage.setItem('old-key', JSON.stringify([1, 2]));
    const v = readLocalStorageWithMigration(localStorage, 'new-key', [], ['old-key']);
    expect(v).toEqual([1, 2]);
    expect(localStorage.getItem('new-key')).toBeTruthy();
    expect(localStorage.getItem('old-key')).toBe(null);
  });
});

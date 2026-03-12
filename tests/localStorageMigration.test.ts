import { describe, expect, it } from 'vitest';
import { readLocalStorageWithMigration } from '../src/hooks/useLocalStorage.js';

function createMemoryStorage(seed?: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(seed || {}));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    }
  };
}

describe('localStorage key migration', () => {
  it('prefers the new key when present', () => {
    const storage = createMemoryStorage({
      'nova-quant-risk-profile': JSON.stringify('aggressive'),
      'quant-demo-risk-profile': JSON.stringify('balanced')
    });
    const value = readLocalStorageWithMigration(storage, 'nova-quant-risk-profile', 'balanced', ['quant-demo-risk-profile']);
    expect(value).toBe('aggressive');
  });

  it('migrates legacy key when new key is absent', () => {
    const storage = createMemoryStorage({
      'quant-demo-risk-profile': JSON.stringify('conservative')
    });
    const value = readLocalStorageWithMigration(storage, 'nova-quant-risk-profile', 'balanced', ['quant-demo-risk-profile']);
    expect(value).toBe('conservative');
    expect(storage.getItem('nova-quant-risk-profile')).toBe(JSON.stringify('conservative'));
    expect(storage.getItem('quant-demo-risk-profile')).toBeNull();
  });

  it('falls back to initial value when no key exists', () => {
    const storage = createMemoryStorage();
    const value = readLocalStorageWithMigration(storage, 'nova-quant-ui-mode', 'standard', ['quant-demo-ui-mode']);
    expect(value).toBe('standard');
  });
});

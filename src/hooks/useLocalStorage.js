import { useEffect, useState } from 'react';

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function readLocalStorageWithMigration(storage, key, initialValue, legacyKeys = []) {
  const nextRaw = storage.getItem(key);
  if (nextRaw !== null) {
    return parseJson(nextRaw, initialValue);
  }

  for (const legacyKey of legacyKeys) {
    const legacyRaw = storage.getItem(legacyKey);
    if (legacyRaw === null) continue;
    const parsed = parseJson(legacyRaw, initialValue);
    try {
      storage.setItem(key, JSON.stringify(parsed));
      storage.removeItem(legacyKey);
    } catch {
      // Ignore migration write failures.
    }
    return parsed;
  }

  return initialValue;
}

export function useLocalStorage(key, initialValue, options = {}) {
  const legacyKeys = Array.isArray(options?.legacyKeys) ? options.legacyKeys : [];
  const [value, setValue] = useState(() => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return initialValue;
      return readLocalStorageWithMigration(window.localStorage, key, initialValue, legacyKeys);
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore write errors in private mode.
    }
  }, [key, value]);

  return [value, setValue];
}

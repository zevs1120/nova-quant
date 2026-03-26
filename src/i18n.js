// ---------------------------------------------------------------------------
// i18n — lightweight translation engine
//
// Language packs live in src/locales/{lang}.js.  Both packs are statically
// imported so they are always available without async loading.  The separate
// files are for code organisation only — both are bundled into the main chunk.
// Future migration to dynamic import() is straightforward if needed.
// ---------------------------------------------------------------------------

import en from './locales/en.js';
import zh from './locales/zh.js';

const messages = { en, zh };

function getByPath(obj, path) {
  return path.split('.').reduce((acc, part) => {
    if (acc && Object.prototype.hasOwnProperty.call(acc, part)) {
      return acc[part];
    }
    return undefined;
  }, obj);
}

function applyVars(template, vars) {
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function createTranslator(lang = 'en') {
  const pack = messages[lang] ?? messages.en;

  return (key, vars, fallback = '') => {
    const value = getByPath(pack, key) ?? getByPath(messages.en, key);
    if (typeof value !== 'string') {
      return fallback || key;
    }
    return applyVars(value, vars);
  };
}

export function getLocale(lang) {
  return lang === 'zh' ? 'zh-CN' : 'en-US';
}

export function getDefaultLang() {
  if (typeof window === 'undefined') return 'en';
  return window.navigator.language?.toLowerCase().includes('zh') ? 'zh' : 'en';
}

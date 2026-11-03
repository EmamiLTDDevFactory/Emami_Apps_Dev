// Pure part of the texts (no React): used by the provider and by library code that has no component around it.
import en from './en.json';
import de from './de.json';

export type Lang = 'en' | 'de';
export type Key = keyof typeof en;
export type Params = Record<string, string | number>;

const TEXTS: Record<Lang, Record<Key, string>> = { en, de };
export const LANGS: Array<{ code: Lang; label: string }> = [{ code: 'en', label: 'English' }, { code: 'de', label: 'Deutsch' }];
export const LANG_KEY = 'mm_lang';

/** Text of a key in a language; {name} placeholders are replaced, an unknown placeholder stays as it is. */
export function translate(lang: Lang, key: Key, params?: Params): string {
  const text = TEXTS[lang][key] ?? TEXTS.en[key] ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (m, p: string) => (p in params ? String(params[p]) : m)) : text;
}

/** The language to start with: the saved choice, else the browser's language, else English. */
export function initialLang(saved: string | null | undefined, browser: string | null | undefined): Lang {
  if (saved === 'en' || saved === 'de') return saved;
  return (browser ?? '').toLowerCase().startsWith('de') ? 'de' : 'en';
}


/** The language in use outside React (errors raised in library code): the saved choice, else the browser's. */
export function currentLang(): Lang {
  try { return initialLang(window.localStorage.getItem(LANG_KEY), navigator.language); } catch { return 'en'; }
}

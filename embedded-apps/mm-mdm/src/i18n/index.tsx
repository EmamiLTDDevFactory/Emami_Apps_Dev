'use client';
// Texts of the screens in English and German: no library. Keys are typed (a key that is not in en.json does not compile) and
// de.json must have the same keys (tests/i18n.test.ts). Not translated, on purpose:
//   - labels of fields and tabs: they come from the model / form definition (the dictionary), as SAP delivers them;
//   - messages and texts that SAP (or the demo service standing in for it) sends: they are shown as received.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANG_KEY, initialLang, translate, type Key, type Lang, type Params } from './translate';

export { LANGS, LANG_KEY, initialLang, translate } from './translate';
export type { Key, Lang, Params } from './translate';

export type T = (key: Key, params?: Params) => string;
interface Ctx { lang: Lang; setLang: (l: Lang) => void; t: T }
const I18n = createContext<Ctx>({ lang: 'en', setLang: () => undefined, t: (k, p) => translate('en', k, p) });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(LANG_KEY); } catch { /* storage blocked */ }
    setLangState(initialLang(saved, navigator.language));
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { window.localStorage.setItem(LANG_KEY, l); } catch { /* storage blocked: the choice lasts for this page */ }
  }, []);
  const t = useCallback<T>((key, params) => translate(lang, key, params), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export const useI18n = (): Ctx => useContext(I18n);
export const useT = (): T => useContext(I18n).t;

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import de from '@/i18n/de.json';
import { fileProblemMessage } from '@/lib/attachments';
import { initialLang, translate, type Key } from '@/i18n/translate';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? sourceFiles(path.join(dir, d.name)) : /\.(ts|tsx)$/.test(d.name) ? [path.join(dir, d.name)] : []));
}

describe('texts', () => {
  it('German has exactly the keys of English, with the same placeholders, and no empty text', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const k of Object.keys(en) as Key[]) {
      expect(de[k], k).toBeTruthy();
      expect(placeholders(de[k]), k).toEqual(placeholders(en[k]));
    }
  });

  it('every key used in the source exists, and every key is used', () => {
    const used = new Set<string>();
    for (const f of sourceFiles(path.resolve(__dirname, '../src'))) {
      if (f.includes(`${path.sep}i18n${path.sep}`)) continue;
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z]+\.[A-Za-z0-9]+)'/g)) used.add(m[1]);
      for (const m of src.matchAll(/translate\([^,]+,\s*'([a-zA-Z]+\.[A-Za-z0-9]+)'/g)) used.add(m[1]);
      for (const m of src.matchAll(/'((?:new|sev|status|history)\.[A-Za-z0-9]+)'/g)) used.add(m[1]);
    }
    const missing = [...used].filter((k) => !(k in en));
    expect(missing).toEqual([]);
    // keys built from a prefix (status.00 .. status.05, history.I .. history.typeA, sev.E ..) count as used
    const prefixes = ['status.', 'history.', 'sev.', 'user.'];
    const unused = Object.keys(en).filter((k) => !used.has(k) && !prefixes.some((p) => k.startsWith(p)));
    expect(unused).toEqual([]);
  });

  it('placeholders are replaced, unknown ones stay, a missing key falls back to English', () => {
    expect(translate('en', 'home.welcome', { name: 'Ann' })).toBe('Welcome, Ann');
    expect(translate('de', 'home.welcome', { name: 'Ann' })).toBe('Willkommen, Ann');
    expect(translate('en', 'home.welcome')).toBe('Welcome, {name}');
    expect(translate('de', 'status.04')).toBe('Zurückgegeben');
  });

  it('the start language: saved choice, else the browser language, else English', () => {
    expect(initialLang('de', 'en-US')).toBe('de');
    expect(initialLang('en', 'de-DE')).toBe('en');
    expect(initialLang(null, 'de-AT')).toBe('de');
    expect(initialLang(null, 'fr-FR')).toBe('en');
    expect(initialLang('xx', undefined)).toBe('en');
  });

  it('file problems are explained in the chosen language', () => {
    expect(fileProblemMessage({ kind: 'empty' }, 'de')).toBe('Die Datei ist leer.');
    expect(fileProblemMessage({ kind: 'tooLarge', limit: 1048576 }, 'de')).toContain('1.0 MB');
  });
});

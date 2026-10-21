import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { localeFromAcceptLanguage, pluralFor, translate } from './core';
import { EN } from './en';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

/** Все ключи t('…') в исходниках (одинарные кавычки с экранированием) */
function usedKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g))
      keys.add(m[1]!.replace(/\\(.)/g, '$1'));
    // Подписи констант, которые выводятся как t(x.label)
    if (/t\(\w+\.label/.test(text)) {
      for (const m of text.matchAll(/label: '([^']*[А-Яа-яЁё][^']*)'/g)) keys.add(m[1]!);
    }
  }
  return keys;
}

describe('i18n', () => {
  it('у каждой строки интерфейса t(…) есть английский перевод', () => {
    const missing = [...usedKeys()].filter((k) => !(k in EN));
    expect(missing).toEqual([]);
  });

  it('подстановки сохраняются в переводе', () => {
    for (const [ru, en] of Object.entries(EN)) {
      const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(vars(en), ru).toEqual(vars(ru));
    }
  });

  it('translate: перевод, запасной русский, подстановки', () => {
    expect(translate('en', 'Вход')).toBe('Sign in');
    expect(translate('ru', 'Вход')).toBe('Вход');
    expect(translate('en', 'Строка без перевода')).toBe('Строка без перевода');
    expect(translate('en', 'Удалено: {n}', { n: 3 })).toBe('Deleted: 3');
  });

  it('язык браузера и склонение', () => {
    expect(localeFromAcceptLanguage('en-US,en;q=0.9')).toBe('en');
    expect(localeFromAcceptLanguage('ru-RU,ru;q=0.9,en;q=0.8')).toBe('ru');
    expect(localeFromAcceptLanguage('de-DE')).toBe('ru');
    expect(localeFromAcceptLanguage(null)).toBe('ru');
    const forms = ['доска', 'доски', 'досок'] as const;
    expect([1, 2, 5, 11, 21, 22].map((n) => pluralFor('ru', n, forms))).toEqual([
      'доска',
      'доски',
      'досок',
      'досок',
      'доска',
      'доски',
    ]);
    expect(pluralFor('en', 1, ['board', '', 'boards'])).toBe('board');
  });
});

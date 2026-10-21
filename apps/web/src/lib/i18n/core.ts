/**
 * Локализация в стиле gettext: ключ — исходная русская строка.
 * t('Вход') → 'Sign in' для en; строка без перевода остаётся русской,
 * поэтому интерфейс можно переводить постепенно и ничего не ломается.
 * Подстановки: t('Удалено: {n}', { n: 3 }).
 */
import { EN } from './en';

export const LOCALES = ['ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ru';
export const LOCALE_COOKIE = 'prostor_locale';

export const LOCALE_NAMES: Record<Locale, string> = { ru: 'Русский', en: 'English' };

const DICTIONARIES: Record<Locale, Readonly<Record<string, string>>> = { ru: {}, en: EN };

export type TranslateVars = Record<string, string | number>;
export type Translate = (text: string, vars?: TranslateVars) => string;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function translate(locale: Locale, text: string, vars?: TranslateVars): string {
  const template = DICTIONARIES[locale][text] ?? text;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

export function translator(locale: Locale): Translate {
  return (text, vars) => translate(locale, text, vars);
}

/** Язык из Accept-Language: английский, если русский не указан раньше него */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  for (const part of header.split(',')) {
    const lang = part.trim().slice(0, 2).toLowerCase();
    if (lang === 'ru' || lang === 'uk' || lang === 'be' || lang === 'kk') return 'ru';
    if (lang === 'en') return 'en';
  }
  return DEFAULT_LOCALE;
}

/** Склонение для русского и английского: plural(n, ['доска','доски','досок']) */
export function pluralFor(
  locale: Locale,
  n: number,
  forms: readonly [string, string, string],
): string {
  if (locale === 'en') return n === 1 ? forms[0] : forms[2];
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

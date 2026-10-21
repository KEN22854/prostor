'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { LOCALE_COOKIE, pluralFor, translator, type Locale, type Translate } from './core';

const I18nContext = createContext<{ locale: Locale; t: Translate }>({
  locale: 'ru',
  t: translator('ru'),
});

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: translator(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** t() в клиентских компонентах */
export function useT(): Translate {
  return useContext(I18nContext).t;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}

/**
 * Смена языка: cookie на год (читает сервер при рендере), сохранение в профиле
 * для вошедших (письма и уведомления на этом языке) и перезагрузка страницы.
 */
export function useSetLocale(): (locale: Locale) => void {
  return useCallback((locale: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${365 * 24 * 3600}; samesite=lax`;
    void fetch('/api/account/locale', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale }),
    })
      .catch(() => undefined)
      .finally(() => window.location.reload());
  }, []);
}

/**
 * Число со склонением на языке интерфейса: tp(5, ['объект', 'объекта', 'объектов']).
 * Русские формы — ключи перевода; в английском берутся переводы первой и последней.
 */
export function usePlural(): (n: number, forms: readonly [string, string, string]) => string {
  const { locale, t } = useContext(I18nContext);
  return useCallback(
    (n, forms) =>
      pluralFor(locale, n, locale === 'ru' ? forms : [t(forms[0]), t(forms[1]), t(forms[2])]),
    [locale, t],
  );
}

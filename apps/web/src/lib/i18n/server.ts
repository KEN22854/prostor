import 'server-only';
import { cookies, headers } from 'next/headers';
import {
  LOCALE_COOKIE,
  isLocale,
  localeFromAcceptLanguage,
  translator,
  type Locale,
  type Translate,
} from './core';

/** Язык запроса: cookie выбора пользователя, иначе язык браузера */
export async function getLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  return localeFromAcceptLanguage((await headers()).get('accept-language'));
}

/** t() для серверных компонентов */
export async function getT(): Promise<Translate> {
  return translator(await getLocale());
}

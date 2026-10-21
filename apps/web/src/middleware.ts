import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth/config';

/**
 * Middleware работает в Edge runtime: только декодирует JWT из cookie
 * (без БД). Полная проверка сессии (блокировка, смена пароля) — в auth()
 * на сервере. Права на конкретную доску проверяются в самих роутах/API.
 */
const { auth } = NextAuth(authConfig);

// /board не здесь: публичные доски доступны без входа, права проверяет сама страница
const PROTECTED_PREFIXES = ['/dashboard', '/settings', '/org'];
const AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password'];

function matches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const isLoggedIn = Boolean(req.auth?.user);

  if (matches(pathname, PROTECTED_PREFIXES) && !isLoggedIn) {
    const url = new URL('/login', req.nextUrl.origin);
    url.searchParams.set('callbackUrl', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // Авторизованному пользователю незачем видеть /login и /register.
  // /reset-password оставляем доступным: ссылка из письма может открыться в залогиненном браузере.
  if (isLoggedIn && matches(pathname, AUTH_PAGES) && !pathname.startsWith('/reset-password')) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // API-роуты проверяют авторизацию сами и должны отвечать 401 JSON, а не редиректом.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sw.js|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)',
  ],
};

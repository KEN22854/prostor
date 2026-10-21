import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-совместимая часть конфигурации Auth.js.
 * Импортируется middleware (Edge runtime), поэтому здесь НЕЛЬЗЯ
 * использовать Prisma, bcrypt, ioredis и прочие node-only модули.
 * Полная конфигурация с провайдерами и адаптером — в src/auth.ts.
 */
export const authConfig = {
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    // Credentials-провайдер работает только с JWT-сессиями.
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
    // Токен перевыпускается не чаще раза в сутки — меньше Set-Cookie в ответах.
    updateAge: 24 * 60 * 60,
  },
  // За reverse-proxy / в Docker Host берётся из заголовков
  trustHost: true,
  providers: [],
  callbacks: {
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;

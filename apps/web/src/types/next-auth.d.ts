import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}

// Колбэки получают JWT из @auth/core, а не из реэкспорта next-auth/jwt,
// поэтому расширяем исходный модуль.
declare module '@auth/core/jwt' {
  interface JWT {
    /** User.sessionVersion на момент входа */
    sv?: number;
  }
}

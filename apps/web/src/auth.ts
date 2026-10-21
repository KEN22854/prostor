import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@prostor/db';
import { loginSchema } from '@prostor/shared';
import { prismaAdapter } from '@/lib/auth/adapter';
import { authConfig } from '@/lib/auth/config';
import {
  AccountDisabledError,
  InvalidCredentialsError,
  InvalidTwoFactorError,
  RateLimitedError,
  TwoFactorRequiredError,
} from '@/lib/auth/errors';
import { oauthProviders } from '@/lib/auth/oauth-providers';
import { checkSession, currentSessionVersion } from '@/lib/auth/session-guard';
import { env } from '@/lib/env';
import { hashPassword, needsRehash, verifyPassword } from '@/lib/password';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { audit } from '@/services/audit';
import { autoJoinByDomain } from '@/services/orgs';
import { verifySecondFactor } from '@/services/two-factor';

/**
 * Хеш случайной строки. Сравниваем с ним, когда пользователя нет:
 * время ответа одинаково для существующих и несуществующих email,
 * и по таймингу нельзя перебрать зарегистрированные адреса.
 */
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(crypto.randomUUID());
  return dummyHash;
}

function credentialsProvider() {
  return Credentials({
    id: 'credentials',
    name: 'Email и пароль',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Пароль', type: 'password' },
      totp: { label: 'Код 2FA', type: 'text' },
    },
    async authorize(raw, request) {
      const parsed = loginSchema.safeParse(raw);
      if (!parsed.success) throw new InvalidCredentialsError();
      const { email, password } = parsed.data;

      const ip = clientIp(request.headers);
      const userAgent = request.headers.get('user-agent');
      // Два лимита: по IP (перебор многих аккаунтов) и по email (перебор пароля одного)
      const [byIp, byEmail] = await Promise.all([
        rateLimit(`login:ip:${ip}`, 30, 15 * 60),
        rateLimit(`login:email:${email}`, 10, 15 * 60),
      ]);
      if (!byIp.ok || !byEmail.ok) throw new RateLimitedError();

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          passwordHash: true,
          disabledAt: true,
          twoFactorEnabled: true,
        },
      });

      const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
      if (!user || !user.passwordHash || !passwordOk) {
        await audit({
          action: 'auth.login_failed',
          actorId: user?.id ?? null,
          metadata: { email, method: 'credentials' },
          ip,
          userAgent,
        });
        throw new InvalidCredentialsError();
      }
      if (user.disabledAt) throw new AccountDisabledError();

      // Второй фактор: без кода — просим его, с неверным — отказ (лимит попыток — в verifySecondFactor)
      if (user.twoFactorEnabled) {
        if (!parsed.data.totp) throw new TwoFactorRequiredError();
        if (!(await verifySecondFactor(user.id, parsed.data.totp))) {
          await audit({ action: 'auth.login_failed', actorId: user.id, metadata: { email, method: 'credentials', reason: '2fa' }, ip, userAgent });
          throw new InvalidTwoFactorError();
        }
      }

      // Пароль верный, а хеш старого формата (bcrypt) — тихо переводим на scrypt
      if (needsRehash(user.passwordHash)) {
        await prisma.user
          .update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } })
          .catch((error: unknown) => console.error('[auth] rehash failed', error));
      }

      await audit({
        action: 'auth.login',
        actorId: user.id,
        metadata: { method: 'credentials' },
        ip,
        userAgent,
      });
      return { id: user.id, name: user.name, email: user.email, image: user.image };
    },
  });
}

/**
 * Ленивая инициализация: env() читается при первом запросе, а не при импорте.
 * Иначе `next build` в Docker (где нет секретов) падал бы на сборке.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const e = env();

  return {
    ...authConfig,
    adapter: prismaAdapter(),
    providers: [credentialsProvider(), ...oauthProviders(e)],
    callbacks: {
      ...authConfig.callbacks,

      async signIn({ user, account }) {
        if (!account || account.provider === 'credentials') return true;

        // Заблокированный пользователь не входит и через OAuth
        if (user.id) {
          const existing = await prisma.user.findUnique({
            where: { id: user.id },
            select: { disabledAt: true },
          });
          if (existing?.disabledAt) return '/login?error=account_disabled';
          if (existing) return true;
        }

        // Новый пользователь через OAuth при закрытой регистрации
        if (!e.ALLOW_SIGNUP) {
          const linked = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
            select: { id: true },
          });
          const byEmail = user.email
            ? await prisma.user.findUnique({
                where: { email: user.email.toLowerCase() },
                select: { id: true },
              })
            : null;
          if (!linked && !byEmail) return '/login?error=SignupDisabled';
        }
        return true;
      },

      async jwt({ token, user }) {
        // Первый вход: фиксируем версию сессии пользователя в токене
        if (user?.id) {
          token.sub = user.id;
          token.sv = await currentSessionVersion(user.id);
          return token;
        }
        if (!token.sub) return null;

        // Последующие запросы: сессия гаснет после смены пароля/блокировки
        const check = await checkSession(token.sub, token.sv);
        if (!check.valid) return null;
        token.name = check.name;
        token.picture = check.image;
        return token;
      },
    },
    events: {
      // Первый вход через OAuth/SSO создаёт пользователя — автоприсоединение по домену почты
      async createUser({ user }) {
        if (user.id && user.email) await autoJoinByDomain(user.id, user.email).catch(() => undefined);
      },
      async signIn({ user, account }) {
        if (!user.id) return;
        await prisma.user
          .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
          .catch((error: unknown) => console.error('[auth] lastLoginAt update failed', error));
        if (account && account.provider !== 'credentials') {
          await audit({
            action: 'auth.login',
            actorId: user.id,
            metadata: { method: account.provider },
          });
        }
      },
      async signOut(message) {
        const userId = 'token' in message ? message.token?.sub : undefined;
        if (userId) await audit({ action: 'auth.logout', actorId: userId });
      },
    },
  };
});

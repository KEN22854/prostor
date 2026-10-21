import 'server-only';
import { PrismaAdapter } from '@auth/prisma-adapter';
import type { Adapter, AdapterAccount } from 'next-auth/adapters';
import { prisma } from '@prostor/db';

/** Поля модели Account в schema.prisma */
const ACCOUNT_FIELDS = [
  'userId',
  'type',
  'provider',
  'providerAccountId',
  'refresh_token',
  'access_token',
  'expires_at',
  'token_type',
  'scope',
  'id_token',
  'session_state',
] as const satisfies ReadonlyArray<keyof AdapterAccount>;

/**
 * PrismaAdapter передаёт в linkAccount весь ответ token-endpoint'а.
 * Провайдеры добавляют туда нестандартные поля (VK — user_id и email,
 * GitHub Apps — refresh_token_expires_in), и Prisma падает с
 * «Unknown argument». Оставляем только колонки таблицы Account.
 */
export function pickAccountFields(account: AdapterAccount): AdapterAccount {
  const picked: Partial<AdapterAccount> = {};
  for (const key of ACCOUNT_FIELDS) {
    if (account[key] !== undefined) {
      (picked as Record<string, unknown>)[key] = account[key];
    }
  }
  return picked as AdapterAccount;
}

export function prismaAdapter(): Adapter {
  const base = PrismaAdapter(prisma);
  const linkAccount = base.linkAccount;
  return {
    ...base,
    linkAccount: linkAccount ? (account) => linkAccount(pickAccountFields(account)) : undefined,
  };
}

import 'server-only';
import { prisma } from '@prostor/db';

/**
 * Проверка «жива ли сессия»: пользователь не заблокирован и не менял пароль
 * после выпуска JWT (sessionVersion совпадает).
 *
 * JWT нельзя отозвать, поэтому сверяемся с БД. Чтобы не делать запрос
 * на каждый рендер, результат кешируется в памяти процесса на TTL.
 * Значит, после сброса пароля старые сессии на других устройствах
 * гаснут не мгновенно, а в пределах TTL — приемлемый компромисс.
 */
const TTL_MS = 60_000;
const MAX_ENTRIES = 10_000;

interface CachedUser {
  sessionVersion: number;
  disabled: boolean;
  name: string | null;
  image: string | null;
  at: number;
}

const cache = new Map<string, CachedUser>();

async function loadUser(userId: string): Promise<CachedUser | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionVersion: true, disabledAt: true, name: true, image: true },
  });
  if (!user) {
    cache.delete(userId);
    return null;
  }
  const entry: CachedUser = {
    sessionVersion: user.sessionVersion,
    disabled: user.disabledAt !== null,
    name: user.name,
    image: user.image,
    at: Date.now(),
  };
  // Простейшее ограничение размера: Map сохраняет порядок вставки — удаляем самый старый
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(userId, entry);
  return entry;
}

export async function currentSessionVersion(userId: string): Promise<number> {
  const user = await loadUser(userId);
  return user?.sessionVersion ?? 0;
}

export type SessionCheck =
  { valid: true; name: string | null; image: string | null } | { valid: false };

export async function checkSession(
  userId: string,
  tokenVersion: number | undefined,
): Promise<SessionCheck> {
  const user = await loadUser(userId);
  if (!user || user.disabled || user.sessionVersion !== (tokenVersion ?? 0)) {
    return { valid: false };
  }
  return { valid: true, name: user.name, image: user.image };
}

/** Сброс кеша после смены пароля/блокировки в этом процессе */
export function invalidateSessionCache(userId: string): void {
  cache.delete(userId);
}

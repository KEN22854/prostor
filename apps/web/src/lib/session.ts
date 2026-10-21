import 'server-only';
import { auth } from '@/auth';
import { ApiError } from '@/lib/api';

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

/** Текущий пользователь или null (для роутов, доступных анонимно — публичные доски) */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
  };
}

/** Для API-роутов: 401 JSON вместо редиректа */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, 'unauthorized', 'Требуется вход');
  return user;
}

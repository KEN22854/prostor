import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@prostor/db';
import {
  API_KEY_PREFIX,
  API_SCOPES,
  createApiKeySchema,
  type ApiKeyDto,
  type ApiScope,
  type CreateApiKeyInput,
  type CreatedApiKeyDto,
} from '@prostor/shared';
import { ApiError } from '@/lib/api';
import { rateLimit } from '@/lib/rate-limit';
import type { SessionUser } from '@/lib/session';
import { audit } from '@/services/audit';

const MAX_KEYS_PER_USER = 20;
/** Обновлять lastUsedAt не чаще раза в минуту — без записи в БД на каждый запрос */
const TOUCH_INTERVAL_MS = 60_000;

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

function toDto(k: {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}): ApiKeyDto {
  const known = new Set<string>(API_SCOPES);
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes.filter((s): s is ApiScope => known.has(s)),
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    expiresAt: k.expiresAt?.toISOString() ?? null,
  };
}

export async function listApiKeys(user: SessionUser): Promise<ApiKeyDto[]> {
  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  return keys.map(toDto);
}

export async function createApiKey(
  user: SessionUser,
  input: CreateApiKeyInput,
): Promise<CreatedApiKeyDto> {
  const data = createApiKeySchema.parse(input);
  const count = await prisma.apiKey.count({ where: { userId: user.id, revokedAt: null } });
  if (count >= MAX_KEYS_PER_USER) {
    throw new ApiError(422, 'too_many', `Не больше ${MAX_KEYS_PER_USER} активных ключей`);
  }
  const key = `${API_KEY_PREFIX}${randomBytes(30).toString('base64url')}`;
  const row = await prisma.apiKey.create({
    data: {
      userId: user.id,
      name: data.name,
      prefix: key.slice(0, API_KEY_PREFIX.length + 6),
      hash: hashKey(key),
      scopes: data.scopes,
      expiresAt: data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 86_400_000) : null,
    },
  });
  await audit({
    action: 'api_key.create',
    actorId: user.id,
    metadata: { name: data.name, scopes: data.scopes },
  });
  return { ...toDto(row), key };
}

export async function revokeApiKey(user: SessionUser, id: string): Promise<void> {
  const res = await prisma.apiKey.updateMany({
    where: { id, userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (res.count === 0) throw new ApiError(404, 'not_found', 'Ключ не найден');
  await audit({ action: 'api_key.revoke', actorId: user.id, metadata: { keyId: id } });
}

/**
 * Пользователь по заголовку Authorization: Bearer pst_… (для /api/v1).
 * Отозванный, просроченный ключ или заблокированный владелец — 401;
 * нет нужного scope — 403. Лимит — 600 запросов в минуту на ключ.
 */
export async function requireApiUser(req: Request, scope: ApiScope): Promise<SessionUser> {
  const header = req.headers.get('authorization') ?? '';
  const key = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
  if (!key || !key.startsWith(API_KEY_PREFIX)) {
    throw new ApiError(401, 'unauthorized', 'Нужен заголовок Authorization: Bearer pst_…');
  }
  const row = await prisma.apiKey.findUnique({
    where: { hash: hashKey(key) },
    select: {
      id: true,
      scopes: true,
      revokedAt: true,
      expiresAt: true,
      lastUsedAt: true,
      user: { select: { id: true, name: true, email: true, image: true, disabledAt: true } },
    },
  });
  if (
    !row ||
    row.revokedAt ||
    (row.expiresAt && row.expiresAt < new Date()) ||
    row.user.disabledAt
  ) {
    throw new ApiError(401, 'invalid_api_key', 'Ключ API недействителен или отозван');
  }
  if (!row.scopes.includes(scope)) {
    throw new ApiError(403, 'insufficient_scope', `У ключа нет права «${scope}»`);
  }
  const limit = await rateLimit(`api:key:${row.id}`, 600, 60);
  if (!limit.ok) throw new ApiError(429, 'rate_limited', 'Лимит запросов: 600 в минуту');
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }
  const { user } = row;
  return { id: user.id, name: user.name, email: user.email, image: user.image };
}

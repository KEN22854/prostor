import type { IncomingMessage } from 'node:http';
import { jwtVerify } from 'jose';
import { prisma, resolveBoardAccess } from '@prostor/db';
import {
  WS_CLOSE,
  WS_TOKEN_AUDIENCE,
  WS_TOKEN_ISSUER,
  can,
  parseBoardRoomName,
  wsTokenPayloadSchema,
  type BoardRole,
  type OrgPolicy,
} from '@prostor/shared';

export interface AuthenticatedConn {
  boardId: string;
  userId: string;
  name: string;
  color: string;
  role: BoardRole;
  policy: OrgPolicy;
  anonymous: boolean;
  canWrite: boolean;
}

export class WsAuthError extends Error {
  constructor(
    readonly closeCode: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Аутентификация при upgrade.
 * URL от y-websocket: /<roomname>?token=<jwt>, roomname = "board:<id>".
 *
 * Роль из токена НЕ используется для решения о доступе — она перепроверяется
 * по БД: токен живёт 5 минут, а доступ могли отозвать раньше.
 */
export async function authenticate(req: IncomingMessage, secret: Uint8Array): Promise<AuthenticatedConn> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const room = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const boardId = parseBoardRoomName(room);
  if (!boardId) throw new WsAuthError(WS_CLOSE.notFound, 'unknown room');

  const token = url.searchParams.get('token');
  if (!token) throw new WsAuthError(WS_CLOSE.unauthorized, 'missing token');

  let payload: unknown;
  try {
    ({ payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      issuer: WS_TOKEN_ISSUER,
      audience: WS_TOKEN_AUDIENCE,
    }));
  } catch {
    throw new WsAuthError(WS_CLOSE.unauthorized, 'invalid or expired token');
  }

  const parsed = wsTokenPayloadSchema.safeParse(payload);
  if (!parsed.success) throw new WsAuthError(WS_CLOSE.unauthorized, 'malformed token payload');
  const claims = parsed.data;
  if (claims.boardId !== boardId) throw new WsAuthError(WS_CLOSE.forbidden, 'token issued for another board');

  const access = await resolveBoardAccess(prisma, boardId, claims.anonymous ? null : claims.sub);
  if (!access) throw new WsAuthError(WS_CLOSE.forbidden, 'no access to board');

  return {
    boardId,
    userId: claims.sub,
    name: claims.name,
    color: claims.color,
    role: access.role,
    policy: access.policy,
    anonymous: claims.anonymous,
    canWrite: can(access.role, 'edit', access.policy),
  };
}

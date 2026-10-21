import 'server-only';
import { SignJWT } from 'jose';
import {
  WS_TOKEN_AUDIENCE,
  WS_TOKEN_ISSUER,
  WS_TOKEN_TTL_SEC,
  type WsTokenPayload,
} from '@prostor/shared';
import { env } from '@/lib/env';

/**
 * Короткоживущий JWT для подключения к WS-серверу (HS256, общий секрет).
 * Отдельный от сессии Auth.js: WS-сервер не умеет читать cookie другого
 * домена и не должен знать AUTH_SECRET.
 */
export async function signWsToken(
  payload: WsTokenPayload,
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + WS_TOKEN_TTL_SEC;
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuer(WS_TOKEN_ISSUER)
    .setAudience(WS_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(env().WS_JWT_SECRET));
  return { token, expiresAt: expiresAt * 1000 };
}

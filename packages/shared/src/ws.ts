import { z } from 'zod';
import { roleSchema } from './permissions';

/**
 * Протокол WS-сервера поверх y-protocols.
 * Первый байт сообщения — тип (varUint), как в y-websocket.
 */
export const WS_MESSAGE = {
  sync: 0,
  awareness: 1,
  auth: 2,
  queryAwareness: 3,
  /** Серверное событие (снапшот сохранён, роль изменена, доска удалена) */
  event: 10,
} as const;

/** Коды закрытия соединения (диапазон 4000–4999 — для приложений) */
export const WS_CLOSE = {
  unauthorized: 4401,
  forbidden: 4403,
  notFound: 4404,
  tooLarge: 4413,
  roleChanged: 4409,
  serverRestart: 4503,
} as const;

/**
 * Payload короткоживущего JWT для подключения к WS.
 * Выдаёт Next.js (/api/boards/:id/ws-token), подписывает WS_JWT_SECRET (HS256).
 * Роль зашита в токен, но WS-сервер всё равно перепроверяет её в БД при upgrade:
 * токен живёт 5 минут, а права могли отозвать.
 */
export const wsTokenPayloadSchema = z.object({
  sub: z.string().min(1),
  boardId: z.string().min(1),
  role: roleSchema,
  name: z.string().max(120),
  color: z.string().max(32),
  /** Гостевой доступ по публичной ссылке (без аккаунта) */
  anonymous: z.boolean().default(false),
});
export type WsTokenPayload = z.infer<typeof wsTokenPayloadSchema>;

/** Awareness-состояние пользователя (эфемерно, не сохраняется) */
export const awarenessStateSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string().max(120),
    color: z.string().max(32),
    avatar: z.string().url().optional(),
  }),
  /** Курсор в мировых координатах */
  cursor: z.object({ x: z.number(), y: z.number() }).nullable(),
  selection: z.array(z.string()).max(10_000),
  viewport: z
    .object({
      x: z.number(),
      y: z.number(),
      zoom: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .nullable(),
  /** Лазерная указка: последние точки следа */
  laser: z
    .array(z.tuple([z.number(), z.number(), z.number()]))
    .max(64)
    .nullable(),
  /** ID пользователя, за которым следим (follow-mode) */
  following: z.string().nullable(),
  /**
   * «Позвать всех за собой»: с момента since остальные автоматически следуют
   * за ведущим (frameId — текущий фрейм в режиме презентации)
   */
  presenting: z.object({ since: z.number(), frameId: z.string().optional() }).nullable(),
});
export type AwarenessState = z.infer<typeof awarenessStateSchema>;

export const wsServerEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot-saved'), snapshotId: z.string(), at: z.number() }),
  z.object({ type: z.literal('role-changed'), role: roleSchema }),
  z.object({ type: z.literal('board-deleted') }),
  z.object({ type: z.literal('restored'), snapshotId: z.string() }),
  /** Комментарии доски изменились — клиенты перечитывают список тредов */
  z.object({ type: z.literal('comments-changed'), threadId: z.string() }),
  /** Голосование началось/закончилось или кто-то проголосовал */
  z.object({ type: z.literal('voting-changed') }),
]);
export type WsServerEvent = z.infer<typeof wsServerEventSchema>;

/** issuer/audience JWT подключения — токен для WS нельзя подсунуть в другое место и наоборот */
export const WS_TOKEN_ISSUER = 'prostor-web';
export const WS_TOKEN_AUDIENCE = 'prostor-ws';
export const WS_TOKEN_TTL_SEC = 5 * 60;

/**
 * Управляющие события web → ws (Redis-канал REDIS_CHANNELS.control).
 * Пример: владелец понизил участника до VIEWER — WS-сервер сразу
 * перестаёт принимать от него изменения, не дожидаясь переподключения.
 */
export const controlEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('role-changed'),
    boardId: z.string(),
    userId: z.string(),
    /** null — доступ отозван */
    role: roleSchema.nullable(),
  }),
  z.object({ type: z.literal('board-deleted'), boardId: z.string() }),
  /**
   * Изменились правила доступа (видимость доски, участник удалён, роль сменилась):
   * WS-сервер заново вычисляет роль каждого подключения по БД. Одно событие
   * покрывает все случаи — включая анонимов публичной доски, ставшей приватной,
   * и тех, кто сохранил доступ через папку или организацию.
   */
  z.object({ type: z.literal('access-changed'), boardId: z.string() }),
  z.object({ type: z.literal('comments-changed'), boardId: z.string(), threadId: z.string() }),
  z.object({ type: z.literal('voting-changed'), boardId: z.string() }),
  z.object({
    type: z.literal('board-restored-version'),
    boardId: z.string(),
    snapshotId: z.string(),
  }),
]);
export type ControlEvent = z.infer<typeof controlEventSchema>;

/** Каналы Redis Pub/Sub между инстансами WS-сервера */
export const REDIS_CHANNELS = {
  /** Yjs-апдейты и awareness: prostor:room:<boardId> */
  room: (boardId: string) => `prostor:room:${boardId}`,
  /** Управляющие события (смена роли, удаление доски) из web → ws */
  control: 'prostor:control',
} as const;

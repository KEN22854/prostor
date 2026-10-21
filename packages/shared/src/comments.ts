import { z } from 'zod';

/**
 * Комментарии к доске. Тред — корневой комментарий, привязанный к элементу
 * (elementId) или к точке холста (x, y), и ответы на него (глубина 1).
 * Тела хранятся в Postgres (не в Yjs): у них свои права, уведомления и аудит,
 * а документ доски не должен расти от переписки.
 */
export const COMMENT_MAX_LENGTH = 5_000;

/** Упоминание в тексте: @[Имя](userId) — в интерфейсе показывается как «@Имя» */
const MENTION_RE = /@\[([^\]\n]{1,120})\]\(([a-z0-9]{8,64})\)/gi;

export function parseMentions(body: string): string[] {
  const ids = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) if (m[2]) ids.add(m[2]);
  return Array.from(ids);
}

export type CommentToken = { kind: 'text'; text: string } | { kind: 'mention'; name: string; userId: string };

/** Разбор тела для отображения: текст и упоминания (без HTML — безопасно для React) */
export function tokenizeComment(body: string): CommentToken[] {
  const tokens: CommentToken[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const index = m.index ?? 0;
    if (index > last) tokens.push({ kind: 'text', text: body.slice(last, index) });
    tokens.push({ kind: 'mention', name: m[1] ?? '', userId: m[2] ?? '' });
    last = index + m[0].length;
  }
  if (last < body.length) tokens.push({ kind: 'text', text: body.slice(last) });
  return tokens;
}

/** Плоский текст для писем и превью уведомлений */
export function commentPlainText(body: string): string {
  return body.replace(MENTION_RE, '@$1');
}

const bodySchema = z.string().trim().min(1, 'Напишите комментарий').max(COMMENT_MAX_LENGTH);
const coord = z.number().finite().min(-1e7).max(1e7);

export const createCommentSchema = z
  .object({
    body: bodySchema,
    /** Ответ в тред */
    parentId: z.string().max(64).optional(),
    elementId: z.string().max(64).optional(),
    x: coord.optional(),
    y: coord.optional(),
  })
  .refine((v) => Boolean(v.parentId) || Boolean(v.elementId) || (v.x !== undefined && v.y !== undefined), {
    message: 'Укажите объект или точку на холсте',
  });
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.object({ body: bodySchema });
export const resolveThreadSchema = z.object({ resolved: z.boolean() });

export const REACTION_EMOJIS = ['👍', '❤️', '🎉', '😄', '🤔', '👀'] as const;
export const reactionSchema = z.object({ emoji: z.enum(REACTION_EMOJIS) });

export interface ReactionDto {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface CommentDto {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  reactions: ReactionDto[];
  canEdit: boolean;
  canDelete: boolean;
}

export interface CommentThreadDto extends CommentDto {
  elementId: string | null;
  x: number | null;
  y: number | null;
  resolvedAt: string | null;
  canResolve: boolean;
  replies: CommentDto[];
}

export const NOTIFICATION_TYPES = ['MENTION', 'COMMENT_REPLY', 'INVITE', 'BOARD_SHARED', 'AI_JOB_DONE'] as const;
export type NotificationTypeValue = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationDto {
  id: string;
  type: NotificationTypeValue;
  createdAt: string;
  readAt: string | null;
  boardId: string | null;
  boardTitle: string | null;
  actorName: string | null;
  /** Тред, к которому ведёт уведомление */
  threadId: string | null;
  excerpt: string | null;
}

/** Полезная нагрузка Notification.payload для комментариев */
export const commentNotificationPayloadSchema = z.object({
  boardId: z.string(),
  threadId: z.string(),
  commentId: z.string(),
  actorId: z.string(),
  actorName: z.string().nullable(),
  excerpt: z.string().max(300),
});
export type CommentNotificationPayload = z.infer<typeof commentNotificationPayloadSchema>;

/** Задача очереди email: письмо по уведомлению, если его не прочитали в приложении */
export const emailQueuePayloadSchema = z.object({
  kind: z.literal('notification'),
  notificationId: z.string(),
});
export type EmailQueuePayload = z.infer<typeof emailQueuePayloadSchema>;

/** Задержка письма: успел прочитать в приложении — письмо не нужно */
export const NOTIFICATION_EMAIL_DELAY_MS = 2 * 60_000;

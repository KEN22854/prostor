import { UnrecoverableError, type Job } from 'bullmq';
import { resolveBoardAccess, type PrismaClient } from '@prostor/db';
import {
  commentNotificationEmail,
  commentNotificationPayloadSchema,
  emailQueuePayloadSchema,
  type EmailMessage,
} from '@prostor/shared';

export interface EmailDeps {
  prisma: PrismaClient;
  /** null — SMTP не настроен: письма пропускаются, уведомления остаются в приложении */
  send: ((message: EmailMessage) => Promise<void>) | null;
  appUrl: string;
}

export type EmailResult = { sent: true } | { sent: false; reason: string };

/**
 * Письмо по уведомлению. Задача ставится с задержкой: к моменту обработки
 * человек мог уже прочитать уведомление в приложении — тогда письма нет.
 * Перед отправкой заново проверяются настройки и доступ к доске: за время
 * задержки участника могли удалить с доски.
 */
export async function processEmailJob(job: Job, deps: EmailDeps): Promise<EmailResult> {
  const parsed = emailQueuePayloadSchema.safeParse(job.data);
  if (!parsed.success) throw new UnrecoverableError('Некорректная задача очереди email');

  const notification = await deps.prisma.notification.findUnique({
    where: { id: parsed.data.notificationId },
    select: {
      id: true,
      type: true,
      payload: true,
      readAt: true,
      emailedAt: true,
      user: { select: { id: true, email: true, emailNotifications: true, disabledAt: true } },
    },
  });
  if (!notification) return { sent: false, reason: 'not_found' };
  if (notification.readAt) return { sent: false, reason: 'already_read' };
  if (notification.emailedAt) return { sent: false, reason: 'already_sent' };
  if (!notification.user.emailNotifications || notification.user.disabledAt) return { sent: false, reason: 'opted_out' };
  if (notification.type !== 'MENTION' && notification.type !== 'COMMENT_REPLY') return { sent: false, reason: 'unsupported_type' };
  if (!deps.send) return { sent: false, reason: 'smtp_disabled' };

  const payload = commentNotificationPayloadSchema.safeParse(notification.payload);
  if (!payload.success) throw new UnrecoverableError('Некорректные данные уведомления');
  const access = await resolveBoardAccess(deps.prisma, payload.data.boardId, notification.user.id);
  if (!access) return { sent: false, reason: 'no_access' };

  const base = deps.appUrl.replace(/\/$/, '');
  await deps.send(
    commentNotificationEmail({
      to: notification.user.email,
      kind: notification.type,
      actorName: payload.data.actorName ?? 'Участник',
      boardTitle: access.title,
      excerpt: payload.data.excerpt,
      url: `${base}/board/${payload.data.boardId}?thread=${payload.data.threadId}`,
      settingsUrl: `${base}/settings`,
    }),
  );
  await deps.prisma.notification.update({ where: { id: notification.id }, data: { emailedAt: new Date() } });
  return { sent: true };
}

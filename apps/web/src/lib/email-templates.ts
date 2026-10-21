import { emailButton as button, emailLayout as layout, escapeHtml } from '@prostor/shared';
import type { MailMessage } from '@/lib/mail';

export function passwordResetEmail(params: {
  to: string;
  name: string | null;
  url: string;
  ttlMinutes: number;
}): MailMessage {
  const greeting = params.name ? `Здравствуйте, ${escapeHtml(params.name)}!` : 'Здравствуйте!';
  return {
    to: params.to,
    subject: 'Сброс пароля в Просторе',
    html: layout(
      'Сброс пароля',
      `<p>${greeting}</p>
<p>Мы получили запрос на сброс пароля. Ссылка действует ${params.ttlMinutes} минут.</p>
${button(params.url, 'Задать новый пароль')}
<p style="color:#6b7280;font-size:13px">Если вы не запрашивали сброс — просто проигнорируйте письмо, пароль не изменится.</p>`,
    ),
    text: `${params.name ? `Здравствуйте, ${params.name}!` : 'Здравствуйте!'}

Ссылка для сброса пароля (действует ${params.ttlMinutes} минут):
${params.url}

Если вы не запрашивали сброс — проигнорируйте письмо.`,
  };
}

export function passwordChangedEmail(params: { to: string }): MailMessage {
  return {
    to: params.to,
    subject: 'Пароль изменён',
    html: layout(
      'Пароль изменён',
      `<p>Пароль вашей учётной записи был изменён, все остальные сеансы завершены.</p>
<p style="color:#6b7280;font-size:13px">Если это были не вы — срочно восстановите доступ через «Забыли пароль?».</p>`,
    ),
    text: 'Пароль вашей учётной записи был изменён, все остальные сеансы завершены. Если это были не вы — восстановите доступ через «Забыли пароль?».',
  };
}

export function boardInviteEmail(params: {
  to: string;
  inviterName: string;
  boardTitle: string;
  roleLabel: string;
  url: string;
  message?: string;
  expiresInDays: number;
}): MailMessage {
  const note = params.message
    ? `<blockquote style="margin:16px 0;padding:8px 12px;border-left:3px solid #c7d2fe;color:#4b5563">${escapeHtml(params.message)}</blockquote>`
    : '';
  return {
    to: params.to,
    subject: `${params.inviterName} приглашает вас на доску «${params.boardTitle}»`,
    html: layout(
      'Приглашение на доску',
      `<p><b>${escapeHtml(params.inviterName)}</b> приглашает вас на доску <b>«${escapeHtml(params.boardTitle)}»</b>
в роли «${escapeHtml(params.roleLabel)}».</p>
${note}
${button(params.url, 'Открыть доску')}
<p style="color:#6b7280;font-size:13px">Приглашение действует ${params.expiresInDays} дней и только для адреса ${escapeHtml(params.to)}.
Если вы не ждали приглашения — просто проигнорируйте письмо.</p>`,
    ),
    text: `${params.inviterName} приглашает вас на доску «${params.boardTitle}» в роли «${params.roleLabel}».
${params.message ? `\n«${params.message}»\n` : ''}
Открыть доску: ${params.url}

Приглашение действует ${params.expiresInDays} дней и только для адреса ${params.to}.`,
  };
}

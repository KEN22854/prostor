/**
 * Разметка писем — общая для web (транзакционные письма) и worker
 * (уведомления из очереди). Чистые функции над строками, без зависимостей.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Простой табличный layout: корректно отображается в Gmail, Яндекс.Почте и Outlook */
export function emailLayout(title: string, body: string): string {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;padding:32px">
<tr><td style="font-size:18px;font-weight:bold;padding-bottom:16px">Простор</td></tr>
<tr><td style="font-size:15px;line-height:1.6">${body}</td></tr>
</table></td></tr></table></body></html>`;
}

export function emailButton(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${escapeHtml(label)}</a></p>`;
}

/** Письмо об упоминании или ответе в комментариях */
export function commentNotificationEmail(params: {
  to: string;
  kind: 'MENTION' | 'COMMENT_REPLY';
  actorName: string;
  boardTitle: string;
  excerpt: string;
  url: string;
  settingsUrl: string;
}): EmailMessage {
  const action =
    params.kind === 'MENTION'
      ? 'упомянул(а) вас в комментарии'
      : 'ответил(а) в обсуждении, где вы участвуете';
  return {
    to: params.to,
    subject:
      params.kind === 'MENTION'
        ? `${params.actorName} упомянул(а) вас на доске «${params.boardTitle}»`
        : `Новый ответ на доске «${params.boardTitle}»`,
    html: emailLayout(
      'Комментарий на доске',
      `<p><b>${escapeHtml(params.actorName)}</b> ${action} на доске <b>«${escapeHtml(params.boardTitle)}»</b>:</p>
<blockquote style="margin:16px 0;padding:8px 12px;border-left:3px solid #c7d2fe;color:#4b5563">${escapeHtml(params.excerpt)}</blockquote>
${emailButton(params.url, 'Открыть обсуждение')}
<p style="color:#6b7280;font-size:13px">Письма о комментариях можно отключить в <a href="${escapeHtml(params.settingsUrl)}" style="color:#4f46e5">настройках аккаунта</a>.</p>`,
    ),
    text: `${params.actorName} ${action} на доске «${params.boardTitle}»:

«${params.excerpt}»

Открыть обсуждение: ${params.url}

Отключить письма о комментариях: ${params.settingsUrl}`,
  };
}

import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/lib/env';

/**
 * Отправка писем через SMTP (Mailpit локально, Resend/SendGrid/Яндекс в проде).
 * В итерации 7 массовые уведомления переедут в BullMQ-очередь `email`;
 * транзакционные письма (сброс пароля) остаются синхронными — пользователь ждёт.
 */
const globalForMail = globalThis as unknown as { __mailer?: Transporter };

function transporter(): Transporter {
  globalForMail.__mailer ??= nodemailer.createTransport(env().SMTP_URL);
  return globalForMail.__mailer;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMail(message: MailMessage): Promise<void> {
  await transporter().sendMail({ from: env().EMAIL_FROM, ...message });
}

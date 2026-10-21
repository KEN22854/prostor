import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import nodemailer from 'nodemailer';
import { prisma } from '@prostor/db';
import { QUEUES, type QueueName } from '@prostor/shared';
import { loadEnv } from './env';
import { processAiJob } from './processors/ai';
import { processEmailJob, type EmailDeps } from './processors/email';
import { createImageGenerator } from './providers/image-gen';
import { createRemoveBgProvider } from './providers/remove-bg';
import { Storage } from './storage';

/**
 * Фоновые задачи (BullMQ):
 *  - prostor-ai: удаление фона, генерация изображений (итерация 5);
 *  - prostor-email: письма-уведомления о комментариях (итерация 7);
 *  - prostor-export, prostor-thumbnails — зарезервированы (экспорт пока в браузере).
 */
const env = loadEnv();

// BullMQ требует maxRetriesPerRequest: null для блокирующих команд воркера.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const aiDeps = {
  prisma,
  storage: new Storage(env),
  removeBg: createRemoveBgProvider(env),
  imageGen: createImageGenerator(env),
};

const mailer = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;
const emailDeps: EmailDeps = {
  prisma,
  appUrl: env.APP_URL,
  send: mailer
    ? async (message) => {
        await mailer.sendMail({ from: env.EMAIL_FROM, ...message });
      }
    : null,
};

async function notImplemented(job: Job): Promise<never> {
  throw new Error(`Обработчик для ${job.queueName}/${job.name} ещё не реализован`);
}

const processors: Record<QueueName, (job: Job) => Promise<unknown>> = {
  [QUEUES.ai]: (job) => processAiJob(job, aiDeps),
  [QUEUES.export]: notImplemented,
  [QUEUES.email]: (job) => processEmailJob(job, emailDeps),
  [QUEUES.thumbnails]: notImplemented,
};

const concurrency: Record<QueueName, number> = {
  [QUEUES.ai]: env.WORKER_CONCURRENCY_AI,
  [QUEUES.export]: env.WORKER_CONCURRENCY_DEFAULT,
  [QUEUES.email]: env.WORKER_CONCURRENCY_DEFAULT,
  [QUEUES.thumbnails]: env.WORKER_CONCURRENCY_DEFAULT,
};

const workers = (Object.values(QUEUES) as QueueName[]).map(
  (queue) =>
    new Worker(queue, processors[queue], {
      connection,
      concurrency: concurrency[queue],
      // Задача, «зависшая» на упавшем воркере, вернётся в очередь (stalled) —
      // для ИИ это нормально: провайдеры идемпотентны, а результат новый Asset
      lockDuration: 5 * 60_000,
    }),
);

for (const w of workers) {
  w.on('failed', (job, err) => {
    console.error(`[worker] ${w.name} job ${job?.id ?? '?'} failed: ${err.message}`);
  });
  w.on('error', (err) => console.error(`[worker] ${w.name} error: ${err.message}`));
}

console.log(
  `[worker] started: ${workers.map((w) => w.name).join(', ')}; ` +
    `remove-bg=${aiDeps.removeBg?.name ?? 'disabled'}, image=${aiDeps.imageGen?.name ?? 'disabled'}, ` +
    `smtp=${mailer ? 'on' : 'off'}`,
);

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal}, draining...`);
  // close() дожидается завершения активных задач — не теряем прогресс ИИ-джобов
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

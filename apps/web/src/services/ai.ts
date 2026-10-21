import 'server-only';
import { prisma, type AiJob, type Prisma } from '@prostor/db';
import {
  aiImageResultSchema,
  type AiJobDto,
  type AiQueuePayload,
  type GenerateImageRequest,
  type RemoveBgRequest,
  generateImageRequestSchema,
} from '@prostor/shared';
import { aiCapabilities } from '@/lib/ai/capabilities';
import { ApiError } from '@/lib/api';
import { env } from '@/lib/env';
import { aiQueue } from '@/lib/queue';
import { rateLimit } from '@/lib/rate-limit';
import type { SessionUser } from '@/lib/session';
import { audit } from '@/services/audit';
import { requireBoardAccess } from '@/services/boards';

/** Лимиты: ИИ дорогой (деньги у Replicate, GPU/CPU у локального rembg) */
const LIMITS = {
  removeBgPerHour: 60,
  generatePerHour: 30,
  /** Одновременно незавершённых задач на пользователя */
  activePerUser: 5,
};

/** rembg работает с растром; SVG и анимированный GIF не поддерживаем */
const REMOVE_BG_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function toDto(job: AiJob): AiJobDto {
  const result = aiImageResultSchema.safeParse(job.output);
  return {
    id: job.id,
    type: job.type === 'GENERATE_IMAGE' ? 'GENERATE_IMAGE' : 'REMOVE_BG',
    status: job.status,
    progress: job.progress,
    error: job.error,
    result: job.status === 'SUCCEEDED' && result.success ? result.data : null,
    createdAt: job.createdAt.toISOString(),
  };
}

async function guardLimits(
  user: SessionUser,
  key: 'remove-bg' | 'generate',
  perHour: number,
): Promise<void> {
  const limit = await rateLimit(`ai:${key}:${user.id}`, perHour, 60 * 60);
  if (!limit.ok) {
    throw new ApiError(
      429,
      'rate_limited',
      'Слишком много ИИ-запросов. Попробуйте позже',
      undefined,
      {
        'Retry-After': String(limit.retryAfter),
      },
    );
  }
  const active = await prisma.aiJob.count({
    where: { userId: user.id, status: { in: ['QUEUED', 'RUNNING'] } },
  });
  if (active >= LIMITS.activePerUser) {
    throw new ApiError(429, 'too_many_active', 'Дождитесь завершения предыдущих ИИ-задач');
  }
}

/**
 * Запись в БД, затем постановка в очередь с jobId = AiJob.id (идемпотентно:
 * повторное добавление с тем же id BullMQ игнорирует). Если Redis недоступен,
 * задача помечается FAILED сразу — клиент не будет вечно ждать QUEUED.
 */
async function enqueue(
  data: Omit<Prisma.AiJobUncheckedCreateInput, 'id'>,
  payload: (jobId: string) => AiQueuePayload,
): Promise<AiJob> {
  const job = await prisma.aiJob.create({ data });
  try {
    await aiQueue().add(payload(job.id).type, payload(job.id), { jobId: job.id });
    return await prisma.aiJob.update({ where: { id: job.id }, data: { queueJobId: job.id } });
  } catch (error: unknown) {
    console.error('[ai] enqueue failed', error);
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', error: 'Очередь задач недоступна', finishedAt: new Date() },
    });
    throw new ApiError(503, 'queue_unavailable', 'Сервис ИИ временно недоступен');
  }
}

export async function createRemoveBgJob(
  user: SessionUser,
  input: RemoveBgRequest,
): Promise<AiJobDto> {
  if (!aiCapabilities().removeBg)
    throw new ApiError(503, 'ai_disabled', 'Удаление фона не настроено на этом сервере');
  await requireBoardAccess(input.boardId, user.id, 'edit');

  const asset = await prisma.asset.findFirst({
    where: { id: input.assetId, boardId: input.boardId, deletedAt: null, kind: 'IMAGE' },
    select: { id: true, mimeType: true },
  });
  if (!asset) throw new ApiError(404, 'asset_not_found', 'Изображение не найдено на этой доске');
  if (!REMOVE_BG_MIME.has(asset.mimeType)) {
    throw new ApiError(415, 'unsupported_type', 'Удаление фона работает для PNG, JPEG и WebP');
  }
  await guardLimits(user, 'remove-bg', LIMITS.removeBgPerHour);

  const job = await enqueue(
    {
      type: 'REMOVE_BG',
      userId: user.id,
      boardId: input.boardId,
      inputAssetId: asset.id,
      input: { assetId: asset.id },
      provider: env().AI_PROVIDER_REMOVE_BG,
    },
    (jobId) => ({
      type: 'REMOVE_BG',
      jobId,
      assetId: asset.id,
      boardId: input.boardId,
      userId: user.id,
    }),
  );
  await audit({
    action: 'ai.job_create',
    actorId: user.id,
    boardId: input.boardId,
    targetType: 'AiJob',
    targetId: job.id,
    metadata: { type: 'REMOVE_BG' },
  });
  return toDto(job);
}

export async function createGenerateImageJob(
  user: SessionUser,
  raw: GenerateImageRequest,
): Promise<AiJobDto> {
  if (!aiCapabilities().generateImage)
    throw new ApiError(503, 'ai_disabled', 'Генерация изображений не настроена на этом сервере');
  const input = generateImageRequestSchema.parse(raw);
  await requireBoardAccess(input.boardId, user.id, 'edit');
  await guardLimits(user, 'generate', LIMITS.generatePerHour);

  const job = await enqueue(
    {
      type: 'GENERATE_IMAGE',
      userId: user.id,
      boardId: input.boardId,
      input: { prompt: input.prompt, aspect: input.aspect },
      provider: env().AI_PROVIDER_IMAGE,
    },
    (jobId) => ({
      type: 'GENERATE_IMAGE',
      jobId,
      boardId: input.boardId,
      userId: user.id,
      prompt: input.prompt,
      aspect: input.aspect,
    }),
  );
  await audit({
    action: 'ai.job_create',
    actorId: user.id,
    boardId: input.boardId,
    targetType: 'AiJob',
    targetId: job.id,
    metadata: { type: 'GENERATE_IMAGE' },
  });
  return toDto(job);
}

/** Статус задачи — только её автору (чужие промпты и результаты не раскрываем) */
export async function getAiJob(user: SessionUser, id: string): Promise<AiJobDto> {
  const job = await prisma.aiJob.findUnique({ where: { id } });
  if (!job || job.userId !== user.id) throw new ApiError(404, 'not_found', 'Задача не найдена');
  return toDto(job);
}

import { randomUUID, createHash } from 'node:crypto';
import { UnrecoverableError, type Job } from 'bullmq';
import type { PrismaClient } from '@prostor/db';
import { aiQueuePayloadSchema, type AiImageResult, type AiQueuePayload } from '@prostor/shared';
import { imageInfo, type ImageInfo } from '../image-info';
import { PermanentProviderError } from '../providers/http';
import type { ImageGenerator } from '../providers/image-gen';
import type { RemoveBgProvider } from '../providers/remove-bg';
import type { Storage } from '../storage';

export interface AiDeps {
  prisma: PrismaClient;
  storage: Pick<Storage, 'get' | 'put'>;
  removeBg: RemoveBgProvider | null;
  imageGen: ImageGenerator | null;
}

const EXT: Record<ImageInfo['mimeType'], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Текст ошибки для пользователя: без стектрейсов и внутренних адресов */
export function userMessage(error: unknown): string {
  if (error instanceof PermanentProviderError || error instanceof UnrecoverableError)
    return error.message;
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'Сервис ИИ не ответил вовремя. Попробуйте ещё раз';
  }
  return 'Не удалось выполнить задачу. Попробуйте ещё раз';
}

/**
 * Обработчик очереди ИИ.
 *
 * Состояние для клиента — в Postgres (AiJob): статус, прогресс 0..100, результат.
 * Ошибки:
 *  - PermanentProviderError / UnrecoverableError — сразу FAILED, без повторов;
 *  - прочие (сеть, 5xx) — BullMQ повторяет с экспоненциальной задержкой,
 *    FAILED ставится после последней попытки.
 */
export async function processAiJob(job: Job<unknown>, deps: AiDeps): Promise<AiImageResult | null> {
  const parsed = aiQueuePayloadSchema.safeParse(job.data);
  if (!parsed.success) throw new UnrecoverableError('Некорректные данные задачи');
  const payload = parsed.data;

  const record = await deps.prisma.aiJob.findUnique({
    where: { id: payload.jobId },
    select: { status: true },
  });
  // Отменена или удалена (например, вместе с доской) — молча пропускаем
  if (!record || record.status === 'CANCELED' || record.status === 'SUCCEEDED') return null;

  const progress = async (value: number) => {
    await deps.prisma.aiJob.update({ where: { id: payload.jobId }, data: { progress: value } });
    await job.updateProgress(value);
  };

  try {
    await deps.prisma.aiJob.update({
      where: { id: payload.jobId },
      data: { status: 'RUNNING', progress: 5, startedAt: new Date(), error: null },
    });

    const board = await deps.prisma.board.findUnique({
      where: { id: payload.boardId },
      select: { deletedAt: true },
    });
    if (!board || board.deletedAt) throw new UnrecoverableError('Доска удалена');

    const result =
      payload.type === 'REMOVE_BG'
        ? await removeBackground(payload, deps, progress)
        : await generate(payload, deps, progress);

    await deps.prisma.aiJob.update({
      where: { id: payload.jobId },
      data: {
        status: 'SUCCEEDED',
        progress: 100,
        output: { ...result },
        resultAssetId: result.assetId,
        finishedAt: new Date(),
      },
    });
    return result;
  } catch (error: unknown) {
    const permanent =
      error instanceof PermanentProviderError || error instanceof UnrecoverableError;
    const attempts = job.opts.attempts ?? 1;
    const final = permanent || job.attemptsMade + 1 >= attempts;
    console.error(
      `[ai] job ${payload.jobId} (${payload.type}) attempt ${job.attemptsMade + 1}/${attempts} failed`,
      error,
    );
    await deps.prisma.aiJob.update({
      where: { id: payload.jobId },
      data: final
        ? { status: 'FAILED', error: userMessage(error), finishedAt: new Date() }
        : { status: 'QUEUED', progress: 0, error: null },
    });
    // UnrecoverableError останавливает повторы BullMQ
    if (permanent && !(error instanceof UnrecoverableError))
      throw new UnrecoverableError(userMessage(error));
    throw error;
  }
}

type Progress = (value: number) => Promise<void>;
type RemoveBgPayload = Extract<AiQueuePayload, { type: 'REMOVE_BG' }>;
type GeneratePayload = Extract<AiQueuePayload, { type: 'GENERATE_IMAGE' }>;

async function removeBackground(
  payload: RemoveBgPayload,
  deps: AiDeps,
  progress: Progress,
): Promise<AiImageResult> {
  if (!deps.removeBg) throw new UnrecoverableError('Удаление фона не настроено на сервере');
  const source = await deps.prisma.asset.findUnique({
    where: { id: payload.assetId },
    select: { s3Key: true, mimeType: true, boardId: true, deletedAt: true },
  });
  if (!source || source.deletedAt || source.boardId !== payload.boardId) {
    throw new UnrecoverableError('Исходное изображение не найдено');
  }

  const input = await deps.storage.get(source.s3Key);
  await progress(25);
  const output = await deps.removeBg.remove(input, source.mimeType);
  await progress(80);
  return storeResult(output, payload, deps, payload.assetId);
}

async function generate(
  payload: GeneratePayload,
  deps: AiDeps,
  progress: Progress,
): Promise<AiImageResult> {
  if (!deps.imageGen) throw new UnrecoverableError('Генерация изображений не настроена на сервере');
  await progress(15);
  const output = await deps.imageGen.generate(payload.prompt, payload.aspect);
  await progress(80);
  return storeResult(output, payload, deps, null);
}

/** Проверка результата, загрузка в S3 и новый Asset (исходный не трогаем — undo на доске вернёт его) */
async function storeResult(
  bytes: Uint8Array,
  payload: AiQueuePayload,
  deps: AiDeps,
  sourceId: string | null,
): Promise<AiImageResult> {
  const info = imageInfo(bytes);
  if (!info || info.width === 0 || info.height === 0) {
    throw new PermanentProviderError('Сервис ИИ вернул не изображение');
  }
  const key = `boards/${payload.boardId}/ai/${randomUUID()}.${EXT[info.mimeType]}`;
  await deps.storage.put(key, bytes, info.mimeType);
  const asset = await deps.prisma.asset.create({
    data: {
      ownerId: payload.userId,
      boardId: payload.boardId,
      kind: 'IMAGE',
      s3Key: key,
      mimeType: info.mimeType,
      sizeBytes: bytes.byteLength,
      width: info.width,
      height: info.height,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sourceId,
    },
    select: { id: true },
  });
  return { assetId: asset.id, width: info.width, height: info.height, mimeType: info.mimeType };
}

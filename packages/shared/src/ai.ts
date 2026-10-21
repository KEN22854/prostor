import { z } from 'zod';

/**
 * Контракт ИИ-задач между web (создаёт), BullMQ (доставляет) и worker (выполняет).
 * Состояние задачи — в Postgres (AiJob): клиент опрашивает его через
 * GET /api/ai/jobs/:id, а не BullMQ напрямую. Так статус переживает
 * перезапуск Redis и виден в истории пользователя.
 */

export const AI_JOB_STATUSES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED'] as const;
export type AiJobStatusValue = (typeof AI_JOB_STATUSES)[number];

export const TERMINAL_AI_STATUSES: ReadonlySet<AiJobStatusValue> = new Set([
  'SUCCEEDED',
  'FAILED',
  'CANCELED',
]);

/** Соотношения сторон генерации — понятные пользователю, провайдер переводит в свои параметры */
export const IMAGE_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const;
export type ImageAspect = (typeof IMAGE_ASPECTS)[number];

export const removeBgRequestSchema = z.object({
  boardId: z.string().min(1).max(64),
  assetId: z.string().min(1).max(64),
});
export type RemoveBgRequest = z.infer<typeof removeBgRequestSchema>;

export const generateImageRequestSchema = z.object({
  boardId: z.string().min(1).max(64),
  prompt: z
    .string()
    .trim()
    .min(3, 'Опишите изображение подробнее')
    .max(1_000, 'Не длиннее 1000 символов'),
  aspect: z.enum(IMAGE_ASPECTS).default('1:1'),
});
export type GenerateImageRequest = z.input<typeof generateImageRequestSchema>;

/** Данные задачи в очереди BullMQ (валидируются и в worker — очередь тоже внешний вход) */
export const aiQueuePayloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('REMOVE_BG'),
    jobId: z.string(),
    assetId: z.string(),
    boardId: z.string(),
    userId: z.string(),
  }),
  z.object({
    type: z.literal('GENERATE_IMAGE'),
    jobId: z.string(),
    boardId: z.string(),
    userId: z.string(),
    prompt: z.string(),
    aspect: z.enum(IMAGE_ASPECTS),
  }),
]);
export type AiQueuePayload = z.infer<typeof aiQueuePayloadSchema>;

/** Результат успешной задачи с изображением (AiJob.output) */
export const aiImageResultSchema = z.object({
  assetId: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mimeType: z.string(),
  /**
   * Удаление фона: результат обрезан до объекта — это прямоугольник
   * в пикселях исходного изображения, который он занимает.
   */
  crop: z
    .object({
      x: z.number().int().nonnegative(),
      y: z.number().int().nonnegative(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
});
export type AiImageResult = z.infer<typeof aiImageResultSchema>;

/** Ответ GET /api/ai/jobs/:id и POST создания задачи */
export interface AiJobDto {
  id: string;
  type: 'REMOVE_BG' | 'GENERATE_IMAGE';
  status: AiJobStatusValue;
  /** 0..100 */
  progress: number;
  error: string | null;
  result: AiImageResult | null;
  createdAt: string;
}

/** Какие ИИ-функции включены на этом инстансе (зависит от настроек провайдеров) */
export interface AiCapabilities {
  removeBg: boolean;
  generateImage: boolean;
}

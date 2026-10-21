import { UnrecoverableError, type Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prostor/db';
import { encodePng } from '../png';
import { PermanentProviderError } from '../providers/http';
import { processAiJob, type AiDeps } from './ai';

type JobRow = {
  status: string;
  progress: number;
  error: string | null;
  output?: unknown;
  resultAssetId?: string;
};

/** Минимальная подмена Prisma: только то, что использует процессор */
function fakePrisma() {
  const jobs = new Map<string, JobRow>([['job1', { status: 'QUEUED', progress: 0, error: null }]]);
  const assets: Array<Record<string, unknown>> = [];
  const prisma = {
    aiJob: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => jobs.get(where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<JobRow> }) => {
        const row = { ...(jobs.get(where.id) as JobRow), ...data };
        jobs.set(where.id, row);
        return row;
      }),
    },
    board: { findUnique: vi.fn(async () => ({ deletedAt: null })) },
    asset: {
      findUnique: vi.fn(async () => ({
        s3Key: 'boards/b/src.png',
        mimeType: 'image/png',
        boardId: 'b',
        deletedAt: null,
      })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        assets.push(data);
        return { id: `asset${assets.length}` };
      }),
    },
  };
  return { prisma: prisma as unknown as PrismaClient, jobs, assets };
}

function fakeJob(data: unknown, attemptsMade = 0, attempts = 3): Job<unknown> {
  return {
    data,
    attemptsMade,
    opts: { attempts },
    updateProgress: vi.fn(async () => undefined),
  } as unknown as Job<unknown>;
}

const removeBgPayload = {
  type: 'REMOVE_BG',
  jobId: 'job1',
  assetId: 'src',
  boardId: 'b',
  userId: 'u',
};

describe('processAiJob', () => {
  it('удаление фона: результат в S3, новый Asset со ссылкой на исходный, SUCCEEDED', async () => {
    const { prisma, jobs, assets } = fakePrisma();
    const put = vi.fn(async () => undefined);
    const deps: AiDeps = {
      prisma,
      storage: { get: async () => new Uint8Array([1, 2, 3]), put },
      removeBg: { name: 'test', remove: async () => encodePng(10, 20, () => [0, 0, 0]) },
      imageGen: null,
    };
    const result = await processAiJob(fakeJob(removeBgPayload), deps);

    expect(result).toEqual({ assetId: 'asset1', width: 10, height: 20, mimeType: 'image/png' });
    expect(jobs.get('job1')).toMatchObject({
      status: 'SUCCEEDED',
      progress: 100,
      resultAssetId: 'asset1',
    });
    expect(assets[0]).toMatchObject({
      sourceId: 'src',
      boardId: 'b',
      kind: 'IMAGE',
      mimeType: 'image/png',
    });
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^boards\/b\/ai\/.+\.png$/),
      expect.any(Uint8Array),
      'image/png',
    );
  });

  it('постоянная ошибка провайдера — сразу FAILED и без повторов', async () => {
    const { prisma, jobs } = fakePrisma();
    const deps: AiDeps = {
      prisma,
      storage: { get: async () => new Uint8Array([1]), put: async () => undefined },
      removeBg: {
        name: 'test',
        remove: async () => {
          throw new PermanentProviderError('Модель отклонила изображение');
        },
      },
      imageGen: null,
    };
    await expect(processAiJob(fakeJob(removeBgPayload), deps)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(jobs.get('job1')).toMatchObject({
      status: 'FAILED',
      error: 'Модель отклонила изображение',
    });
  });

  it('временная ошибка — задача вернётся в очередь, FAILED только после последней попытки', async () => {
    const { prisma, jobs } = fakePrisma();
    const deps: AiDeps = {
      prisma,
      storage: { get: async () => new Uint8Array([1]), put: async () => undefined },
      removeBg: {
        name: 'test',
        remove: async () => {
          throw new Error('ECONNRESET');
        },
      },
      imageGen: null,
    };
    await expect(processAiJob(fakeJob(removeBgPayload, 0, 3), deps)).rejects.toThrow('ECONNRESET');
    expect(jobs.get('job1')?.status).toBe('QUEUED');

    await expect(processAiJob(fakeJob(removeBgPayload, 2, 3), deps)).rejects.toThrow('ECONNRESET');
    // Пользователь видит понятный текст, а не внутреннюю ошибку
    expect(jobs.get('job1')).toMatchObject({
      status: 'FAILED',
      error: 'Не удалось выполнить задачу. Попробуйте ещё раз',
    });
  });

  it('ответ провайдера не изображение — FAILED', async () => {
    const { prisma, jobs } = fakePrisma();
    const deps: AiDeps = {
      prisma,
      storage: { get: async () => new Uint8Array([1]), put: async () => undefined },
      removeBg: { name: 'test', remove: async () => new TextEncoder().encode('<html>502</html>') },
      imageGen: null,
    };
    await expect(processAiJob(fakeJob(removeBgPayload), deps)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(jobs.get('job1')).toMatchObject({
      status: 'FAILED',
      error: 'Сервис ИИ вернул не изображение',
    });
  });

  it('некорректные данные задачи отклоняются', async () => {
    const { prisma } = fakePrisma();
    const deps: AiDeps = {
      prisma,
      storage: { get: async () => new Uint8Array(), put: async () => undefined },
      removeBg: null,
      imageGen: null,
    };
    await expect(processAiJob(fakeJob({ type: 'NOPE' }), deps)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });

  it('генерация без настроенного провайдера — понятная ошибка', async () => {
    const { prisma, jobs } = fakePrisma();
    const deps: AiDeps = {
      prisma,
      storage: { get: async () => new Uint8Array(), put: async () => undefined },
      removeBg: null,
      imageGen: null,
    };
    const payload = {
      type: 'GENERATE_IMAGE',
      jobId: 'job1',
      boardId: 'b',
      userId: 'u',
      prompt: 'кот',
      aspect: '1:1',
    };
    await expect(processAiJob(fakeJob(payload), deps)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(jobs.get('job1')?.error).toBe('Генерация изображений не настроена на сервере');
  });

  it('отменённая задача пропускается', async () => {
    const { prisma, jobs } = fakePrisma();
    jobs.set('job1', { status: 'CANCELED', progress: 0, error: null });
    const remove = vi.fn();
    const deps: AiDeps = {
      prisma,
      storage: { get: async () => new Uint8Array(), put: async () => undefined },
      removeBg: { name: 't', remove },
      imageGen: null,
    };
    expect(await processAiJob(fakeJob(removeBgPayload), deps)).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });
});

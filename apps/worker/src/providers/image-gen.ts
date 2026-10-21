import { createHash } from 'node:crypto';
import Replicate from 'replicate';
import type { ImageAspect } from '@prostor/shared';
import type { WorkerEnv } from '../env';
import { encodePng } from '../png';
import { PermanentProviderError, fetchBytes } from './http';
import { firstUrl } from './remove-bg';

export interface ImageGenerator {
  readonly name: string;
  generate(prompt: string, aspect: ImageAspect): Promise<Uint8Array>;
}

/** Генерация через Replicate (по умолчанию Flux Schnell — быстрая и дешёвая) */
export class ReplicateImageGenerator implements ImageGenerator {
  readonly name = 'replicate';
  private readonly client: Replicate;

  constructor(
    token: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {
    this.client = new Replicate({ auth: token, useFileOutput: false });
  }

  async generate(prompt: string, aspect: ImageAspect): Promise<Uint8Array> {
    const output = await this.client.run(this.model as `${string}/${string}`, {
      input: { prompt, aspect_ratio: aspect, num_outputs: 1, output_format: 'png' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const url = firstUrl(output);
    if (!url)
      throw new PermanentProviderError(
        'Модель не вернула изображение (возможно, запрос отклонён фильтром)',
      );
    return fetchBytes(url, this.timeoutMs);
  }
}

const MOCK_SIZE: Record<ImageAspect, [number, number]> = {
  '1:1': [512, 512],
  '16:9': [768, 432],
  '9:16': [432, 768],
  '4:3': [640, 480],
  '3:4': [480, 640],
};

/**
 * Заглушка без внешних сервисов: детерминированный по промпту градиент.
 * Нужна для разработки, e2e-тестов и демонстраций on-prem без доступа к ИИ —
 * весь конвейер (очередь → S3 → доска) работает так же, как с настоящей моделью.
 */
export class MockImageGenerator implements ImageGenerator {
  readonly name = 'mock';

  async generate(prompt: string, aspect: ImageAspect): Promise<Uint8Array> {
    const [w, h] = MOCK_SIZE[aspect];
    const hash = createHash('sha256').update(prompt).digest();
    const c1 = [hash[0] ?? 0, hash[1] ?? 0, hash[2] ?? 0] as const;
    const c2 = [hash[3] ?? 255, hash[4] ?? 255, hash[5] ?? 255] as const;
    const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
    // Имитация работы модели, чтобы на клиенте был виден прогресс
    await new Promise((r) => setTimeout(r, 600));
    return encodePng(w, h, (x, y) => {
      const t = (x / w + y / h) / 2;
      return [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];
    });
  }
}

export function createImageGenerator(env: WorkerEnv): ImageGenerator | null {
  if (env.AI_PROVIDER_IMAGE === 'mock') return new MockImageGenerator();
  if (env.AI_PROVIDER_IMAGE === 'replicate' && env.REPLICATE_API_TOKEN) {
    return new ReplicateImageGenerator(
      env.REPLICATE_API_TOKEN,
      env.REPLICATE_MODEL_IMAGE,
      env.AI_PROVIDER_TIMEOUT_MS,
    );
  }
  // Не настроено — задачи завершатся понятной ошибкой, остальные очереди worker продолжают работать
  return null;
}

import Replicate from 'replicate';
import type { WorkerEnv } from '../env';
import { PermanentProviderError, fetchBytes, toDataUri } from './http';

export interface RemoveBgProvider {
  readonly name: string;
  /** Исходное изображение → PNG с прозрачным фоном */
  remove(image: Uint8Array, mimeType: string): Promise<Uint8Array>;
}

/**
 * Локальный rembg (контейнер danielgatis/rembg, `rembg s`):
 * POST /api/remove, multipart-поле file → image/png.
 * Подходит для закрытого контура: изображения не покидают инфраструктуру.
 */
export class LocalRembg implements RemoveBgProvider {
  readonly name = 'rembg';

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  async remove(image: Uint8Array, mimeType: string): Promise<Uint8Array> {
    const form = new FormData();
    form.set('file', new Blob([image], { type: mimeType }), 'input');
    // В POST-варианте API rembg параметры (model и др.) — поля формы, не query
    form.set('model', this.model);
    const url = new URL('/api/remove', this.baseUrl);
    return fetchBytes(url.toString(), this.timeoutMs, { method: 'POST', body: form });
  }
}

/** Облачное удаление фона через Replicate (rembg / BiRefNet) */
export class ReplicateRemoveBg implements RemoveBgProvider {
  readonly name = 'replicate';
  private readonly client: Replicate;

  constructor(
    token: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {
    // useFileOutput: false — на выходе обычные URL, а не потоки FileOutput
    this.client = new Replicate({ auth: token, useFileOutput: false });
  }

  async remove(image: Uint8Array, mimeType: string): Promise<Uint8Array> {
    const output = await this.client.run(this.model as `${string}/${string}`, {
      input: { image: toDataUri(image, mimeType) },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const url = firstUrl(output);
    if (!url) throw new PermanentProviderError('Модель не вернула изображение');
    return fetchBytes(url, this.timeoutMs);
  }
}

/** Ответ Replicate: строка-URL или массив URL (зависит от модели) */
export function firstUrl(output: unknown): string | null {
  if (typeof output === 'string' && /^https?:\/\//.test(output)) return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const url = firstUrl(item);
      if (url) return url;
    }
  }
  return null;
}

export function createRemoveBgProvider(env: WorkerEnv): RemoveBgProvider | null {
  if (env.AI_PROVIDER_REMOVE_BG === 'local' && env.REMBG_URL) {
    return new LocalRembg(env.REMBG_URL, env.REMBG_MODEL, env.AI_PROVIDER_TIMEOUT_MS);
  }
  if (env.AI_PROVIDER_REMOVE_BG === 'replicate' && env.REPLICATE_API_TOKEN) {
    return new ReplicateRemoveBg(
      env.REPLICATE_API_TOKEN,
      env.REPLICATE_MODEL_REMOVE_BG,
      env.AI_PROVIDER_TIMEOUT_MS,
    );
  }
  return null;
}

import { createHash } from 'node:crypto';
import Replicate from 'replicate';
import type { ImageAspect } from '@prostor/shared';
import type { WorkerEnv } from '../env';
import { encodePng } from '../png';
import { PermanentProviderError, fetchBytes, readLimited } from './http';
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

const POLLINATIONS_SIZE: Record<ImageAspect, [number, number]> = {
  '1:1': [1024, 1024],
  '16:9': [1280, 720],
  '9:16': [720, 1280],
  '4:3': [1024, 768],
  '3:4': [768, 1024],
};

/** Сколько раз ждём бесплатный лимит Pollinations («1 картинка в 45 секунд с IP») */
const POLLINATIONS_LIMIT_RETRIES = 3;

/**
 * Pollinations.ai — бесплатная генерация (Flux) без регистрации.
 * Без ключа: не чаще 1 картинки в ~45 с с одного IP и логотип в углу;
 * с бесплатным ключом (enter.pollinations.ai) — без логотипа и лимита.
 * Промпты не на английском модель понимает плохо: сначала переводим их
 * текстовой моделью того же сервиса; если перевод не удался — просим сервис
 * переписать запрос сам (`enhance`, он хуже сохраняет смысл).
 */
export class PollinationsImageGenerator implements ImageGenerator {
  readonly name = 'pollinations';

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly token: string | undefined,
    private readonly timeoutMs: number,
    private readonly textUrl: string = 'https://text.pollinations.ai',
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Перевод промпта на английский; null — не удалось (сеть, лимит, странный ответ) */
  async translate(prompt: string): Promise<string | null> {
    const url = new URL(`/${encodeURIComponent(prompt)}`, this.textUrl);
    url.searchParams.set('model', 'openai');
    url.searchParams.set('private', 'true');
    url.searchParams.set('system', TRANSLATE_SYSTEM);
    try {
      const res = await fetch(url, {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(Math.min(this.timeoutMs, 30_000)),
      });
      if (!res.ok) return null;
      const text = (await res.text()).replace(/\s+/g, ' ').trim();
      // Ответ должен быть похож на перевод: непустой, латиницей, разумной длины
      if (!text || text.length > prompt.length * 4 + 200 || hasNonAscii(text)) return null;
      return text;
    } catch {
      return null;
    }
  }

  private authHeaders(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  buildUrl(prompt: string, aspect: ImageAspect, seed: number, enhance = false): string {
    const [width, height] = POLLINATIONS_SIZE[aspect];
    const url = new URL(`/prompt/${encodeURIComponent(prompt)}`, this.baseUrl);
    url.searchParams.set('width', String(width));
    url.searchParams.set('height', String(height));
    url.searchParams.set('model', this.model);
    url.searchParams.set('seed', String(seed));
    url.searchParams.set('nologo', 'true');
    // Не публиковать запрос и картинку в общей ленте сервиса
    url.searchParams.set('private', 'true');
    if (enhance) url.searchParams.set('enhance', 'true');
    return url.toString();
  }

  async generate(prompt: string, aspect: ImageAspect): Promise<Uint8Array> {
    let finalPrompt = prompt;
    let enhance = false;
    if (hasNonAscii(prompt)) {
      const translated = await this.translate(prompt);
      if (translated) finalPrompt = translated;
      else enhance = true;
    }
    const url = this.buildUrl(
      finalPrompt,
      aspect,
      Math.floor(Math.random() * 1_000_000_000),
      enhance,
    );
    const headers = this.authHeaders();

    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(this.timeoutMs) });
      if (res.ok) return readLimited(res);
      const body = await res.text().catch(() => '');
      // 402/429 — бесплатный лимит: ждём, сколько просит сервис, и повторяем
      if ((res.status === 402 || res.status === 429) && attempt < POLLINATIONS_LIMIT_RETRIES) {
        await this.sleep(retryAfterMs(res, body));
        continue;
      }
      if (res.status === 402 || res.status === 429) {
        throw new PermanentProviderError(
          'Бесплатный лимит генерации исчерпан (1 картинка в 45 секунд). Подождите минуту или добавьте ключ POLLINATIONS_TOKEN',
        );
      }
      if (res.status >= 400 && res.status < 500) {
        throw new PermanentProviderError(`Сервис генерации отклонил запрос (HTTP ${res.status})`);
      }
      throw new Error(`HTTP ${res.status} от ${new URL(url).host}: ${body.slice(0, 200)}`);
    }
  }
}

const TRANSLATE_SYSTEM =
  'Translate the user text to English for an image generation prompt. Keep every detail. Reply with the translation only.';

function hasNonAscii(text: string): boolean {
  return /[^\u0000-\u007f]/.test(text);
}

/** Пауза до повтора: заголовок Retry-After или «Retry after 31s» в теле ответа (+1 с запаса) */
export function retryAfterMs(res: Pick<Response, 'headers'>, body: string): number {
  const header = Number(res.headers.get('retry-after'));
  const fromBody = Number(/retry after (\d+)\s*s/i.exec(body)?.[1]);
  const seconds =
    Number.isFinite(header) && header > 0
      ? header
      : Number.isFinite(fromBody) && fromBody > 0
        ? fromBody
        : 45;
  return (Math.min(seconds, 90) + 1) * 1000;
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
  if (env.AI_PROVIDER_IMAGE === 'pollinations') {
    return new PollinationsImageGenerator(
      env.POLLINATIONS_URL,
      env.POLLINATIONS_MODEL,
      env.POLLINATIONS_TOKEN,
      env.AI_PROVIDER_TIMEOUT_MS,
      env.POLLINATIONS_TEXT_URL,
    );
  }
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

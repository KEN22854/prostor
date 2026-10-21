import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodePng } from '../png';
import { PermanentProviderError } from './http';
import { PollinationsImageGenerator, retryAfterMs } from './image-gen';

const limitBody = JSON.stringify({
  error: {
    code: 'FREE_LIMIT',
    message: 'Free limit reached: 1 image every 45 seconds per IP. Retry after 31s',
  },
});

function generator(sleep = vi.fn(async () => undefined), token?: string) {
  return {
    gen: new PollinationsImageGenerator(
      'https://image.pollinations.ai',
      'flux',
      token,
      10_000,
      'https://text.pollinations.ai',
      sleep,
    ),
    sleep,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('PollinationsImageGenerator', () => {
  it('URL: размеры по соотношению сторон, private, nologo; enhance — только по запросу', () => {
    const { gen } = generator();
    const en = new URL(gen.buildUrl('a cat', '16:9', 7));
    expect(decodeURIComponent(en.pathname)).toBe('/prompt/a cat');
    expect(Object.fromEntries(en.searchParams)).toMatchObject({
      width: '1280',
      height: '720',
      model: 'flux',
      seed: '7',
      nologo: 'true',
      private: 'true',
    });
    expect(en.searchParams.has('enhance')).toBe(false);
    expect(new URL(gen.buildUrl('tiger', '1:1', 1, true)).searchParams.get('enhance')).toBe('true');
  });

  it('бесплатный лимит: ждёт, сколько просит сервис, и повторяет', async () => {
    const png = encodePng(4, 4, () => [1, 2, 3]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(limitBody, { status: 402 }))
      .mockResolvedValueOnce(
        new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { gen, sleep } = generator(
      vi.fn(async () => undefined),
      'secret',
    );

    const bytes = await gen.generate('a cat', '1:1');
    expect(bytes).toEqual(png);
    expect(sleep).toHaveBeenCalledWith(32_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ Authorization: 'Bearer secret' });
  });

  it('лимит не отпускает — понятная ошибка без бесконечных повторов', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(limitBody, { status: 402 })),
    );
    const { gen, sleep } = generator();
    await expect(gen.generate('a cat', '1:1')).rejects.toBeInstanceOf(PermanentProviderError);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('5xx — обычная ошибка (BullMQ повторит задачу)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('oops', { status: 502 })),
    );
    const { gen } = generator();
    const error = await gen.generate('a cat', '1:1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PermanentProviderError);
  });
});

describe('перевод промпта', () => {
  const png = () =>
    new Response(
      encodePng(4, 4, () => [1, 2, 3]),
      { status: 200 },
    );

  it('русский промпт переводится, генерация идёт по переводу без enhance', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('A ginger cat on a windowsill, photo', { status: 200 }))
      .mockResolvedValueOnce(png());
    vi.stubGlobal('fetch', fetchMock);
    await generator().gen.generate('рыжий кот на подоконнике', '1:1');
    const textUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(textUrl.host).toBe('text.pollinations.ai');
    const imageUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(decodeURIComponent(imageUrl.pathname)).toBe(
      '/prompt/A ginger cat on a windowsill, photo',
    );
    expect(imageUrl.searchParams.has('enhance')).toBe(false);
  });

  it('перевод не удался — исходный промпт с enhance', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(png());
    vi.stubGlobal('fetch', fetchMock);
    await generator().gen.generate('тигр', '1:1');
    const imageUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(decodeURIComponent(imageUrl.pathname)).toBe('/prompt/тигр');
    expect(imageUrl.searchParams.get('enhance')).toBe('true');
  });

  it('английский промпт не переводится', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(png());
    vi.stubGlobal('fetch', fetchMock);
    await generator().gen.generate('a tiger', '1:1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('retryAfterMs', () => {
  it('Retry-After в заголовке важнее текста; без подсказок — 45 с; не дольше 90 с', () => {
    expect(retryAfterMs(new Response('', { headers: { 'retry-after': '10' } }), limitBody)).toBe(
      11_000,
    );
    expect(retryAfterMs(new Response(''), limitBody)).toBe(32_000);
    expect(retryAfterMs(new Response(''), '')).toBe(46_000);
    expect(retryAfterMs(new Response('', { headers: { 'retry-after': '600' } }), '')).toBe(91_000);
  });
});

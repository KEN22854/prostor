import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { encodePng } from '../png';
import { PermanentProviderError } from './http';
import { LocalRembg, firstUrl } from './remove-bg';

let server: Server | null = null;

/** Поднимает HTTP-сервер, имитирующий `rembg s`, и возвращает его адрес */
async function startStub(handler: (body: Buffer, contentType: string, url: string) => { status: number; body: Uint8Array | string }) {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const out = handler(Buffer.concat(chunks), req.headers['content-type'] ?? '', req.url ?? '');
      res.writeHead(out.status, { 'content-type': 'image/png' });
      res.end(out.body);
    });
  });
  await new Promise<void>((r) => server?.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server?.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

describe('LocalRembg', () => {
  it('отправляет multipart с файлом и моделью на /api/remove и возвращает PNG', async () => {
    let seen: { url: string; contentType: string; body: string } | null = null;
    const png = encodePng(4, 4, () => [0, 0, 0]);
    const url = await startStub((body, contentType, path) => {
      seen = { url: path, contentType, body: body.toString('latin1') };
      return { status: 200, body: png };
    });

    const result = await new LocalRembg(url, 'isnet-general-use', 5_000).remove(new Uint8Array([1, 2, 3]), 'image/jpeg');

    expect(Buffer.from(result).equals(Buffer.from(png))).toBe(true);
    expect(seen).not.toBeNull();
    const req = seen as unknown as { url: string; contentType: string; body: string };
    expect(req.url).toBe('/api/remove');
    expect(req.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(req.body).toContain('name="file"');
    expect(req.body).toContain('Content-Type: image/jpeg');
    expect(req.body).toMatch(/name="model"\r\n\r\nisnet-general-use/);
  });

  it('4xx от rembg — постоянная ошибка (без повторов)', async () => {
    const url = await startStub(() => ({ status: 422, body: 'bad image' }));
    await expect(new LocalRembg(url, 'u2net', 5_000).remove(new Uint8Array([1]), 'image/png')).rejects.toBeInstanceOf(
      PermanentProviderError,
    );
  });

  it('5xx — временная ошибка (будет повтор)', async () => {
    const url = await startStub(() => ({ status: 503, body: 'busy' }));
    const error = await new LocalRembg(url, 'u2net', 5_000).remove(new Uint8Array([1]), 'image/png').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PermanentProviderError);
  });
});

describe('firstUrl (ответ Replicate)', () => {
  it('строка, массив и вложенные массивы', () => {
    expect(firstUrl('https://a/b.png')).toBe('https://a/b.png');
    expect(firstUrl(['https://a/1.png', 'https://a/2.png'])).toBe('https://a/1.png');
    expect(firstUrl([[null, 'https://x/y.webp']])).toBe('https://x/y.webp');
    expect(firstUrl({ url: 'https://a' })).toBeNull();
    expect(firstUrl('not-a-url')).toBeNull();
  });
});

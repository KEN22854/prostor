import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';
import { TINY_PNG, canvasCenter, elements, openNewBoard, toPage } from './helpers';

/**
 * ИИ-конвейер целиком: web → BullMQ → worker → провайдер → S3 → доска.
 * Требует запущенный worker с AI_PROVIDER_IMAGE=mock (в .env по умолчанию — pollinations, ходит в интернет).
 * Удаление фона — настоящий rembg на :7000, а если его нет — заглушка с тем же
 * HTTP API (POST /api/remove, multipart file+model → PNG), поднятая тестом.
 */
let rembgStub: Server | null = null;
let stubCalls = 0;

test.beforeAll(async () => {
  const real = await fetch('http://localhost:7000/api', { signal: AbortSignal.timeout(5_000) }).catch(() => null);
  if (real) return; // запущен настоящий rembg — проверяем с ним
  rembgStub = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('latin1');
      if (req.method !== 'POST' || req.url !== '/api/remove' || !body.includes('name="file"') || !body.includes('name="model"')) {
        res.writeHead(400).end('bad request');
        return;
      }
      stubCalls++;
      res.writeHead(200, { 'content-type': 'image/png' }).end(TINY_PNG);
    });
  });
  // Порт занят (настоящий rembg не успел ответить под нагрузкой или заглушку поднял
  // соседний воркер) — пользуемся тем, кто уже слушает :7000
  const stub = rembgStub;
  await new Promise<void>((resolve, reject) => {
    stub.once('error', (e: NodeJS.ErrnoException) => (e.code === 'EADDRINUSE' ? resolve() : reject(e)));
    stub.listen(7000, resolve);
  });
  if (!stub.listening) rembgStub = null;
});

test.afterAll(async () => {
  await new Promise<void>((r) => (rembgStub ? rembgStub.close(() => r()) : r()));
});

test.describe('ИИ', () => {
  test('генерация изображения: диалог → прогресс на доске → картинка', async ({ page }) => {
    await openNewBoard(page, 'E2E генерация');
    await page.getByRole('button', { name: 'Сгенерировать изображение' }).click();
    await page.getByLabel('Описание').fill('Уютный офис с растениями, акварель');
    await page.getByRole('radio', { name: /Широкий/ }).click();
    await page.getByRole('button', { name: 'Сгенерировать', exact: true }).click();

    // Диалог закрывается сразу, на доске — индикатор
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('ai-progress')).toBeVisible();

    await expect.poll(async () => (await elements(page)).map((e) => e.type), { timeout: 30_000 }).toEqual(['image']);
    await expect(page.getByTestId('ai-progress')).toHaveCount(0);
    const [image] = await elements(page);
    // mock для 16:9 отдаёт 768×432 — на доске вписано в 480 по большей стороне
    expect(image?.width).toBe(480);
    expect(image?.height).toBe(270);
    const res = await page.request.get(`/api/assets/${image?.assetId}`);
    expect(res.status()).toBe(200);
  });

  test('«Убрать фон» из контекстного меню, отмена возвращает исходник', async ({ page }) => {
    await openNewBoard(page, 'E2E удаление фона');
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('i');
    await (await chooser).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: TINY_PNG });
    await expect.poll(async () => (await elements(page)).length).toBe(1);
    const [original] = await elements(page);

    // Правый клик по изображению → «Убрать фон»
    const center = await toPage(page, (original?.x ?? 0) + (original?.width ?? 0) / 2, (original?.y ?? 0) + (original?.height ?? 0) / 2);
    await page.mouse.click(center.x, center.y, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Убрать фон' }).click();

    await expect
      .poll(async () => (await elements(page))[0]?.assetId, { timeout: 60_000 })
      .not.toBe(original?.assetId);
    await expect(page.getByText('Фон удалён')).toBeVisible();
    const [processed] = await elements(page);
    expect(processed?.id).toBe(original?.id);
    if (rembgStub) expect(stubCalls).toBeGreaterThan(0);

    // Исходная картинка не удаляется — один шаг отмены возвращает её
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await elements(page))[0]?.assetId).toBe(original?.assetId);
  });

  /**
   * Настоящий rembg на настоящей фотографии (включается явно, т.к. нужен
   * контейнер rembg ~1,6 ГБ): E2E_REMBG_PHOTO=/путь/к/фото.jpg
   */
  test('удаление фона на реальном фото через rembg', async ({ page }) => {
    const photo = process.env.E2E_REMBG_PHOTO;
    test.skip(!photo || rembgStub !== null, 'нужен запущенный rembg и E2E_REMBG_PHOTO');
    test.setTimeout(240_000);
    const { readFileSync } = await import('node:fs');
    const buffer = readFileSync(photo ?? '');

    await openNewBoard(page, 'E2E rembg фото');
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('i');
    await (await chooser).setFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer });
    await expect.poll(async () => (await elements(page)).length).toBe(1);
    const [original] = await elements(page);

    const center = await toPage(page, (original?.x ?? 0) + (original?.width ?? 0) / 2, (original?.y ?? 0) + (original?.height ?? 0) / 2);
    await page.mouse.click(center.x, center.y, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Убрать фон' }).click();
    await expect(page.getByTestId('ai-progress')).toBeVisible();

    // Первый запрос к rembg скачивает модель (~170 МБ) — даём время
    await expect.poll(async () => (await elements(page))[0]?.assetId, { timeout: 200_000, intervals: [1_000] }).not.toBe(original?.assetId);
    const [processed] = await elements(page);

    const res = await page.request.get(`/api/assets/${processed?.assetId}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');
    const png = await res.body();
    // IHDR: размеры как у исходника, тип цвета 6 = RGBA (есть альфа-канал)
    expect(png.readUInt32BE(16)).toBe(1000);
    expect(png.readUInt32BE(20)).toBe(667);
    expect(png[25]).toBe(6);
    if (process.env.E2E_REMBG_OUT) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(process.env.E2E_REMBG_OUT, png);
    }
  });

  test('API: защита и валидация', async ({ page }) => {
    const boardId = await openNewBoard(page, 'E2E ИИ API');
    const c = await canvasCenter(page);
    expect(c.x).toBeGreaterThan(0);

    // Чужой/несуществующий ассет
    const missing = await page.request.post('/api/ai/remove-bg', { data: { boardId, assetId: 'nope' } });
    expect(missing.status()).toBe(404);

    // SVG — rembg работает только с растром
    const svg = await page.request.post(`/api/boards/${boardId}/assets`, {
      multipart: {
        file: { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>') },
        width: '10',
        height: '10',
      },
    });
    expect(svg.status()).toBe(201);
    const { id: svgId } = (await svg.json()) as { id: string };
    const unsupported = await page.request.post('/api/ai/remove-bg', { data: { boardId, assetId: svgId } });
    expect(unsupported.status()).toBe(415);

    // Слишком короткий промпт
    const short = await page.request.post('/api/ai/generate-image', { data: { boardId, prompt: 'a' } });
    expect(short.status()).toBe(422);

    // Чужая задача не видна
    expect((await page.request.get('/api/ai/jobs/does-not-exist')).status()).toBe(404);
  });
});

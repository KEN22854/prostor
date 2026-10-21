import { expect, test } from '@playwright/test';
import { TINY_PNG, canvasCenter, drag, elements, openNewBoard, selection, toPage } from './helpers';

test.describe('инструменты холста', () => {
  test('стикер: создание, ввод текста, повторное редактирование двойным кликом', async ({
    page,
  }) => {
    await openNewBoard(page);
    const c = await canvasCenter(page);

    await page.keyboard.press('n');
    await page.mouse.click(c.x, c.y);
    const editor = page.getByTestId('text-editor').getByRole('textbox', { name: 'Текст объекта' });
    await expect(editor).toBeFocused();
    await page.keyboard.type('Первая мысль');
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);

    await expect.poll(async () => (await elements(page))[0]?.text).toBe('Первая мысль');

    await page.mouse.dblclick(c.x, c.y);
    await expect(editor).toBeFocused();
    await page.keyboard.press('End');
    await page.keyboard.type(' и вторая');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await elements(page))[0]?.text).toBe('Первая мысль и вторая');
  });

  test('фигура перетаскиванием, ресайз Transformer, отмена по шагам', async ({ page }) => {
    await openNewBoard(page);
    const c = await canvasCenter(page);

    await page.keyboard.press('r');
    await drag(page, { x: c.x - 100, y: c.y - 60 }, { x: c.x + 100, y: c.y + 60 });
    let [shape] = await elements(page);
    expect(shape?.type).toBe('shape');
    expect(shape?.width).toBeCloseTo(200, -1);
    expect(await selection(page)).toEqual([shape?.id]);

    // Правая нижняя ручка Transformer
    const corner = await toPage(
      page,
      (shape?.x ?? 0) + (shape?.width ?? 0),
      (shape?.y ?? 0) + (shape?.height ?? 0),
    );
    await drag(page, { x: corner.x + 2, y: corner.y + 2 }, { x: corner.x + 82, y: corner.y + 42 });
    [shape] = await elements(page);
    expect(shape?.width).toBeCloseTo(280, -1);
    expect(shape?.height).toBeCloseTo(160, -1);

    await page.keyboard.press('Control+z');
    await expect
      .poll(async () => Math.round((await elements(page))[0]?.width ?? 0))
      .toBeLessThan(220);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await elements(page)).length).toBe(0);
  });

  test('рамка выделения, перемещение со снэппингом, дублирование, удаление и undo', async ({
    page,
  }) => {
    await openNewBoard(page);
    const c = await canvasCenter(page);
    await page.keyboard.press('n');
    await page.mouse.click(c.x - 150, c.y);
    await page.keyboard.press('Escape');
    await page.keyboard.press('n');
    await page.mouse.click(c.x + 150, c.y);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await elements(page)).length).toBe(2);

    // Рамка вокруг обоих
    await drag(page, { x: c.x - 320, y: c.y - 180 }, { x: c.x + 320, y: c.y + 180 });
    await expect.poll(async () => (await selection(page)).length).toBe(2);
    await expect(page.getByTestId('selection-count')).toHaveText('2 объекта');

    const before = await elements(page);
    await drag(page, { x: c.x - 150, y: c.y }, { x: c.x - 90, y: c.y + 40 });
    const after = await elements(page);
    expect(after[0]?.x).not.toBe(before[0]?.x);
    // Двигаются вместе: взаимное расположение сохраняется
    expect((after[1]?.x ?? 0) - (after[0]?.x ?? 0)).toBeCloseTo(
      (before[1]?.x ?? 0) - (before[0]?.x ?? 0),
      5,
    );

    await page.keyboard.press('Control+d');
    await expect.poll(async () => (await elements(page)).length).toBe(4);
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await elements(page)).length).toBe(2);

    // Ctrl+D и Delete — разные шаги отмены, даже если быстро подряд
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await elements(page)).length).toBe(4);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await elements(page)).length).toBe(2);
  });

  test('группировка: клик по элементу выделяет всю группу', async ({ page }) => {
    await openNewBoard(page);
    const c = await canvasCenter(page);
    for (const dx of [-150, 150]) {
      await page.keyboard.press('n');
      await page.mouse.click(c.x + dx, c.y);
      await page.keyboard.press('Escape');
    }
    await page.keyboard.press('Escape');

    await page.mouse.click(c.x - 150, c.y);
    await page.keyboard.down('Shift');
    await page.mouse.click(c.x + 150, c.y);
    await page.keyboard.up('Shift');
    await expect.poll(async () => (await selection(page)).length).toBe(2);
    await page.keyboard.press('Control+g');
    await expect
      .poll(async () => new Set((await elements(page)).map((e) => e.groupId)).size)
      .toBe(1);

    await page.keyboard.press('Escape');
    await expect.poll(async () => (await selection(page)).length).toBe(0);
    await page.mouse.click(c.x - 150, c.y);
    await expect.poll(async () => (await selection(page)).length).toBe(2);

    await page.keyboard.press('Control+Shift+g');
    await expect.poll(async () => (await elements(page)).every((e) => !e.groupId)).toBe(true);
  });

  test('копирование и вставка (Ctrl+C / Ctrl+V)', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard-события проверяем в Chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openNewBoard(page);
    const c = await canvasCenter(page);
    await page.keyboard.press('n');
    await page.mouse.click(c.x, c.y);
    await page.keyboard.type('Копия');
    await page.keyboard.press('Escape');

    await page.keyboard.press('Control+c');
    await page.mouse.move(c.x + 250, c.y + 100);
    await page.keyboard.press('Control+v');
    await expect.poll(async () => (await elements(page)).length).toBe(2);
    const texts = (await elements(page)).map((e) => e.text);
    expect(texts).toEqual(['Копия', 'Копия']);
  });

  test('карандаш и ластик', async ({ page }) => {
    await openNewBoard(page);
    const c = await canvasCenter(page);
    await page.keyboard.press('p');
    await page.mouse.move(c.x - 100, c.y);
    await page.mouse.down();
    for (let i = 0; i <= 20; i++)
      await page.mouse.move(c.x - 100 + i * 10, c.y + Math.sin(i / 3) * 30);
    await page.mouse.up();
    await expect.poll(async () => (await elements(page)).map((e) => e.type)).toEqual(['path']);

    await page.keyboard.press('e');
    await drag(page, { x: c.x, y: c.y - 60 }, { x: c.x, y: c.y + 60 });
    await expect.poll(async () => (await elements(page)).length).toBe(0);
  });

  test('изображение: загрузка через выбор файла и раздача с проверкой прав', async ({
    page,
    playwright,
  }) => {
    await openNewBoard(page);
    // Файл — прямо в input: нативный диалог выбора под нагрузкой открывается нестабильно,
    // а проверяем здесь загрузку и права доступа (горячая клавиша I — в ai.spec)
    await page.getByTestId('image-input').setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: TINY_PNG });

    await expect.poll(async () => (await elements(page)).map((e) => e.type)).toEqual(['image']);
    const [image] = await elements(page);
    const res = await page.request.get(`/api/assets/${image?.assetId}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');

    // Без сессии ассет приватной доски не отдаётся. Явно пустой storageState:
    // иначе Playwright подставил бы сессию проекта даже в новый контекст.
    const anon = await playwright.request.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const anonRes = await anon.get(`${new URL(page.url()).origin}/api/assets/${image?.assetId}`);
    expect(anonRes.status()).toBe(404);
    await anon.dispose();
  });

  test('подделка типа файла отклоняется сервером', async ({ page }) => {
    const boardId = await openNewBoard(page);
    const res = await page.request.post(`/api/boards/${boardId}/assets`, {
      multipart: {
        file: {
          name: 'evil.png',
          mimeType: 'image/png',
          buffer: Buffer.from('<script>alert(1)</script>'),
        },
        width: '10',
        height: '10',
      },
    });
    expect(res.status()).toBe(415);
  });
});

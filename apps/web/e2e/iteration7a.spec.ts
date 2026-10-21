import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { canvasCenter, drag, elements, openNewBoard, toPage } from './helpers';

/** Ждём, пока ElementStore покажет нужное число элементов */
async function expectCount(page: Page, n: number) {
  await expect.poll(async () => (await elements(page)).length, { timeout: 10_000 }).toBe(n);
}

test.describe('фреймы, шаблоны, экспорт, версии', () => {
  test('фрейм: создание инструментом, содержимое двигается вместе с ним, список фреймов', async ({ page }) => {
    await openNewBoard(page, 'Фреймы');
    const c = await canvasCenter(page);

    await page.keyboard.press('f');
    await drag(page, { x: c.x - 250, y: c.y - 150 }, { x: c.x + 250, y: c.y + 150 });
    await expectCount(page, 1);
    const [frame] = await elements(page);
    expect(frame?.type).toBe('frame');

    // Стикер внутри фрейма получает frameId
    await page.keyboard.press('Escape');
    await page.keyboard.press('n');
    await page.mouse.click(c.x, c.y);
    await page.keyboard.press('Escape');
    await expectCount(page, 2);
    const frameId = await page.evaluate(() => {
      const api = (window as unknown as { __prostorCanvas: { elementStore: { values(): Iterable<{ type: string; frameId?: string }> } } }).__prostorCanvas;
      return [...api.elementStore.values()].find((e) => e.type === 'sticky')?.frameId ?? null;
    });
    expect(frameId).toBe(frame?.id);

    // Тянем фрейм за заголовок — стикер едет с ним
    const before = (await elements(page)).find((e) => e.type === 'sticky');
    const title = await toPage(page, (frame?.x ?? 0) + 30, (frame?.y ?? 0) - 12);
    await page.mouse.click(c.x + 400, c.y + 300); // снять выделение
    await drag(page, title, { x: title.x + 120, y: title.y + 60 });
    await expect
      .poll(async () => (await elements(page)).find((e) => e.type === 'sticky')?.x ?? 0)
      .toBeGreaterThan((before?.x ?? 0) + 50);

    // Переименование в панели свойств и список фреймов
    await page.getByLabel('Название фрейма').fill('Идеи');
    await page.getByLabel('Название фрейма').press('Enter');
    await page.getByRole('button', { name: /Фреймы/ }).click();
    await expect(page.getByRole('list', { name: 'Фреймы доски' })).toContainText('Идеи');
  });

  test('шаблон канбана создаёт колонки-фреймы со стикерами', async ({ page }) => {
    const res = await page.request.post('/api/boards', { data: { title: 'Канбан', templateKey: 'kanban' } });
    expect(res.status()).toBe(201);
    const { id } = (await res.json()) as { id: string };
    await page.goto(`/board/${id}`);
    await page.waitForFunction(() => Boolean((window as unknown as { __prostorCanvas?: { actions?: unknown } }).__prostorCanvas?.actions));
    await expect.poll(async () => (await elements(page)).filter((e) => e.type === 'frame').length, { timeout: 15_000 }).toBe(4);
    expect((await elements(page)).filter((e) => e.type === 'sticky').length).toBeGreaterThan(3);
    await page.getByRole('button', { name: /Фреймы/ }).click();
    await expect(page.getByRole('list', { name: 'Фреймы доски' })).toContainText('В работе');
  });

  test('экспорт PNG, SVG со слоями и PDF по фреймам', async ({ page }) => {
    const res = await page.request.post('/api/boards', { data: { title: 'Ретро на экспорт', templateKey: 'retro' } });
    const { id } = (await res.json()) as { id: string };
    await page.goto(`/board/${id}`);
    await page.waitForFunction(() => Boolean((window as unknown as { __prostorCanvas?: { actions?: unknown } }).__prostorCanvas?.actions));
    await expect.poll(async () => (await elements(page)).length, { timeout: 15_000 }).toBeGreaterThan(3);

    const download = async (format: 'PNG' | 'SVG' | 'PDF', scope?: string) => {
      await page.getByRole('button', { name: 'Экспорт' }).click();
      await page.getByRole('radio', { name: format }).click();
      if (scope) await page.getByLabel('Что экспортировать').selectOption({ label: scope });
      const [file] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: `Скачать ${format}` }).click(),
      ]);
      const path = await file.path();
      return { name: file.suggestedFilename(), data: await readFile(path) };
    };

    const png = await download('PNG');
    expect(png.name).toBe('Ретро на экспорт.png');
    expect(png.data.subarray(1, 4).toString()).toBe('PNG');
    // Ширина PNG (IHDR) — доска шириной ~1500 px при 2× больше 2000
    expect(png.data.readUInt32BE(16)).toBeGreaterThan(2000);

    const svg = await download('SVG');
    const text = svg.data.toString('utf8');
    expect(text).toContain('inkscape:label="Что было хорошо"');
    expect(text).toContain('inkscape:label="Действия"');
    // Текст стикера переносится по словам — каждая строка в своём <tspan>
    expect(text).toMatch(/>Релиз прошёл( без)?<\/tspan>/);

    const pdf = await download('PDF', 'Все фреймы — по странице (3)');
    expect(pdf.data.subarray(0, 5).toString()).toBe('%PDF-');
    expect((pdf.data.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBe(3);
  });

  test('история версий: сохранение, просмотр и восстановление с отменой', async ({ page }) => {
    await openNewBoard(page, 'Версии');
    const c = await canvasCenter(page);
    for (const dx of [-150, 150]) {
      await page.keyboard.press('n');
      await page.mouse.click(c.x + dx, c.y);
      await page.keyboard.press('Escape');
    }
    await expectCount(page, 2);

    await page.getByRole('button', { name: 'История версий' }).click();
    await page.getByLabel('Название версии').fill('Два стикера');
    await page.getByRole('button', { name: 'Сохранить версию' }).click();
    await expect(page.getByTestId('version-list')).toContainText('Два стикера');

    // Удаляем всё
    await page.getByTestId('board-canvas').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await expectCount(page, 0);

    // Просмотр версии показывает её содержимое, не трогая живую доску
    await page.getByTestId('version-item').filter({ hasText: 'Два стикера' }).click();
    await expect(page.getByTestId('version-preview-bar')).toBeVisible();
    await expectCount(page, 2);
    await page.getByRole('button', { name: 'К текущей доске' }).click();
    await expectCount(page, 0);

    // Восстановление
    await page.getByTestId('version-item').filter({ hasText: 'Два стикера' }).click();
    await page.getByRole('button', { name: 'Восстановить' }).click();
    await expect(page.getByText('Версия восстановлена')).toBeVisible();
    await expect(page.getByTestId('version-preview-bar')).toHaveCount(0);
    await expectCount(page, 2);
    // Перед восстановлением сохранился снимок текущего состояния
    await expect(page.getByTestId('version-list')).toContainText('Перед восстановлением');

    // Ctrl+Z отменяет восстановление целиком
    await page.getByTestId('board-canvas').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await expectCount(page, 0);
  });
});

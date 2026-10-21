import { expect, test } from '@playwright/test';
import { canvasCenter, elements, openNewBoard } from './helpers';

interface RichSummary {
  text?: string;
  rich?: Array<{ bullet?: boolean; runs: Array<{ text: string; bold?: boolean; italic?: boolean }> }>;
}

async function firstRich(page: import('@playwright/test').Page): Promise<RichSummary | undefined> {
  return page.evaluate(() => {
    const api = (window as unknown as { __prostorCanvas: { elementStore: { values(): Iterable<RichSummary> } } }).__prostorCanvas;
    const el = [...api.elementStore.values()][0];
    return el ? { text: el.text, rich: el.rich } : undefined;
  });
}

test.describe('форматированный текст', () => {
  test('жирный, курсив и список в стикере', async ({ page }) => {
    await openNewBoard(page, 'Rich text');
    const c = await canvasCenter(page);
    await page.keyboard.press('n');
    await page.mouse.click(c.x, c.y);
    const editor = page.getByTestId('text-editor').getByRole('textbox', { name: 'Текст объекта' });
    await expect(editor).toBeFocused();

    await page.keyboard.type('Обычный ');
    await page.keyboard.press('Control+b');
    await page.keyboard.type('жирный');
    await page.keyboard.press('Control+b');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- пункт');
    await page.getByRole('button', { name: 'Курсив' }).click();
    await page.keyboard.type(' курсивом');
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);

    await expect.poll(async () => (await firstRich(page))?.rich).toEqual([
      { runs: [{ text: 'Обычный ' }, { text: 'жирный', bold: true }] },
      { bullet: true, runs: [{ text: 'пункт' }, { text: ' курсивом', italic: true }] },
    ]);
    // Плоская копия для поиска и экспорта
    expect((await firstRich(page))?.text).toBe('Обычный жирный\n• пункт курсивом');

    // Ctrl+Z после закрытия редактора отменяет набор текста
    await page.getByTestId('board-canvas').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await firstRich(page))?.text ?? '').not.toContain('курсивом');
  });

  test('двое правят один стикер одновременно — правки сливаются', async ({ page, browser }) => {
    const boardId = await openNewBoard(page, 'Совместный текст');
    const c = await canvasCenter(page);
    await page.keyboard.press('n');
    await page.mouse.click(c.x, c.y);
    await page.keyboard.type('Начало');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await elements(page))[0]?.text).toBe('Начало');

    // Вторая вкладка того же пользователя — отдельный Yjs-клиент
    const second = await page.context().newPage();
    await second.goto(`/board/${boardId}`);
    await second.waitForFunction(() => Boolean((window as unknown as { __prostorCanvas?: { actions?: unknown } }).__prostorCanvas?.actions));
    await expect.poll(async () => (await elements(second))[0]?.text, { timeout: 15_000 }).toBe('Начало');

    // Оба открывают редактор: первый пишет в конец, второй — в начало (вторая вкладка — программно)
    await page.mouse.dblclick(c.x, c.y);
    const el = (await elements(second))[0];
    expect(el).toBeDefined();
    await second.evaluate((id) => {
      const api = (window as unknown as { __prostorCanvas: { canvasStore: { getState(): { select(ids: string[]): void; setEditing(id: string): void } } } }).__prostorCanvas;
      api.canvasStore.getState().select([id]);
      api.canvasStore.getState().setEditing(id);
    }, el?.id ?? '');
    const ed1 = page.getByTestId('text-editor').getByRole('textbox', { name: 'Текст объекта' });
    const ed2 = second.getByTestId('text-editor').getByRole('textbox', { name: 'Текст объекта' });
    await expect(ed1).toBeFocused();
    await expect(ed2).toBeFocused();

    await page.keyboard.press('Control+End');
    await page.keyboard.type(' и конец');
    await second.keyboard.press('Control+Home');
    await second.keyboard.type('Совсем ');

    // Правки сливаются вживую, пока оба редактора открыты (в DOM редактора ещё и подписи
    // курсоров коллег — поэтому сверяем текст элемента, а не содержимое contenteditable)
    await expect.poll(async () => (await elements(page))[0]?.text, { timeout: 10_000 }).toBe('Совсем Начало и конец');
    await expect.poll(async () => (await elements(second))[0]?.text).toBe('Совсем Начало и конец');
    // Курсор коллеги виден в тексте с его именем
    await expect(ed1.locator('.ProseMirror-yjs-cursor')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await second.keyboard.press('Escape');
    await expect.poll(async () => (await elements(page))[0]?.text).toBe('Совсем Начало и конец');
    await second.close();
  });
});

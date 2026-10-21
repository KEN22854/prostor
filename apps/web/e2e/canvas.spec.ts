import { expect, test } from '@playwright/test';
import { canvasCenter, openNewBoard } from './helpers';

test.describe('холст', () => {
  test('зум кнопками и Ctrl+колесом, стикер, мини-карта', async ({ page }) => {
    await openNewBoard(page, 'E2E холст');
    const percent = page.getByTestId('zoom-percent');
    await expect(percent).toHaveText('100%');

    await page.getByRole('button', { name: 'Увеличить' }).click();
    await expect(percent).toHaveText('125%');
    await page.getByRole('button', { name: 'Уменьшить' }).click();
    await expect(percent).toHaveText('100%');

    // Ctrl + колесо вниз — отдаление к курсору
    const c = await canvasCenter(page);
    await page.mouse.move(c.x, c.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 300);
    await page.keyboard.up('Control');
    await expect
      .poll(async () => Number.parseInt((await percent.textContent()) ?? '100', 10))
      .toBeLessThan(100);

    // Сброс до 100% кликом по проценту
    await percent.click();
    await expect(percent).toHaveText('100%');

    // Стикер появляется на холсте и в счётчике
    await page.keyboard.press('n');
    await page.mouse.click(c.x, c.y);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('element-count')).toHaveText('1 объект');
    await expect(page.getByTestId('board-canvas')).toHaveAttribute('data-visible-count', '1');

    await expect(page.getByTestId('minimap')).toBeVisible();
  });

  test('инструмент «рука» по клавише H и возврат по V', async ({ page }) => {
    await openNewBoard(page, 'E2E рука');
    const hand = page.getByRole('button', { name: 'Рука' });
    await page.keyboard.press('h');
    await expect(hand).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('v');
    await expect(hand).toHaveAttribute('aria-pressed', 'false');
  });
});

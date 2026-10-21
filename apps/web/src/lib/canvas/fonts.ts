/**
 * Имя шрифта для canvas.
 *
 * next/font регистрирует Inter под хешированным именем ('__Inter_a1b2c3'),
 * а в элементах хранится переносимое 'Inter' (доска должна одинаково
 * выглядеть в экспорте и у других клиентов). Canvas2D не понимает CSS-переменные,
 * поэтому реальное семейство берём из вычисленного стиля body.
 */
let bodyFont: string | null = null;

export function canvasFont(family: string | undefined): string {
  if (typeof document === 'undefined') return family ?? 'sans-serif';
  if (!family || family === 'Inter') {
    bodyFont ??= getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
    return bodyFont;
  }
  // Кавычки: семейства из нескольких слов и с цифрами («Exo 2») иначе не разбираются в CSS/canvas
  return `"${family.replace(/"/g, '')}", system-ui, sans-serif`;
}

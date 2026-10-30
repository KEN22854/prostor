import { describe, expect, it } from 'vitest';
import { buildText } from './element-factory';
import { drawMinimapElement, MinimapImages } from './minimap-render';

/** Контекст-заглушка: запоминает, каким шрифтом и цветом нарисован каждый фрагмент */
function recordingContext() {
  const texts: { text: string; font: string; color: string }[] = [];
  const rects: string[] = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    font: '',
    globalAlpha: 1,
    lineWidth: 1,
    textBaseline: '',
    textAlign: '',
    fillText(text: string) {
      texts.push({ text, font: ctx.font, color: String(ctx.fillStyle) });
    },
    fillRect() {
      rects.push(String(ctx.fillStyle));
    },
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    beginPath() {},
    rect() {},
    clip() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, rects };
}

describe('drawMinimapElement — форматирование при отдалении', () => {
  const images = new MinimapImages(() => undefined);
  const el = {
    ...buildText({ x: 0, y: 0, userId: 'u', zIndex: 'a0', text: 'Важно и обычно', fontSize: 40 }),
    fontFamily: 'Georgia',
    rich: [
      {
        runs: [
          { text: 'Важно', bold: true, color: '#e5484d', highlight: '#fde68a' },
          { text: ' и обычно' },
        ],
      },
    ],
  };

  it('рисует фрагменты своим цветом, начертанием и шрифтом, с выделением', () => {
    const { ctx, texts, rects } = recordingContext();
    drawMinimapElement(ctx, el, 0.2, images);
    const bold = texts.find((t) => t.text.includes('Важно'));
    expect(bold?.color).toBe('#e5484d');
    expect(bold?.font).toMatch(/bold/);
    expect(bold?.font).toMatch(/Georgia/);
    expect(texts.some((t) => t.text.includes('обычно') && t.color === el.textColor)).toBe(true);
    expect(rects).toContain('#fde68a');
  });

  it('нечитаемо мелкий текст — штрихи вместо букв', () => {
    const { ctx, texts } = recordingContext();
    drawMinimapElement(ctx, el, 0.05, images);
    expect(texts).toHaveLength(0);
  });
});

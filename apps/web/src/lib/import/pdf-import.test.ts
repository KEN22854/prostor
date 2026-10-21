import { describe, expect, it } from 'vitest';
import { layoutPdfPages } from './pdf-import';

describe('раскладка импортированного PDF', () => {
  it('страница — фрейм с картинкой внутри, по 4 в ряд', () => {
    let z = 0;
    const pages = Array.from({ length: 5 }, (_, i) => ({ assetId: `a${i}`, width: 1000, height: 1414 }));
    const els = layoutPdfPages(pages, { at: { x: 0, y: 0 }, name: 'Отчёт.pdf', userId: 'u', nextZ: () => `a${z++}` });
    expect(els).toHaveLength(10);
    const frames = els.filter((e) => e.type === 'frame');
    const images = els.filter((e) => e.type === 'image');
    expect(frames.map((f) => ('title' in f ? f.title : ''))).toContain('Отчёт.pdf — стр. 5');
    // Картинка привязана к своему фрейму и совпадает с ним по габаритам
    images.forEach((img, i) => {
      expect(img.frameId).toBe(frames[i]?.id);
      expect(img.width).toBe(800);
      expect(img.height).toBe(1131);
    });
    // Пятая страница — во втором ряду
    expect(frames[4]?.x).toBe(0);
    expect(frames[4]?.y).toBe(1131 + 80);
    expect(frames[3]?.x).toBe(3 * 880);
  });
});

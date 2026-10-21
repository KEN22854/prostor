import { describe, expect, it } from 'vitest';
import { BOARD_TEMPLATES, boardElementSchema } from '@prostor/shared';
import { buildTemplate } from './board-templates';

describe('шаблоны досок', () => {
  it('пустая доска — без элементов', () => {
    expect(buildTemplate('blank', 'u1')).toEqual([]);
  });

  for (const { key } of BOARD_TEMPLATES.filter((t) => t.key !== 'blank')) {
    it(`«${key}»: валидные элементы, уникальные id и zIndex, корректные фреймы`, () => {
      const elements = buildTemplate(key, 'u1');
      expect(elements.length).toBeGreaterThan(3);
      for (const el of elements) expect(boardElementSchema.safeParse(el).success, el.type).toBe(true);
      expect(new Set(elements.map((e) => e.id)).size).toBe(elements.length);
      expect(new Set(elements.map((e) => e.zIndex)).size).toBe(elements.length);
      const frames = new Map(elements.filter((e) => e.type === 'frame').map((f) => [f.id, f]));
      for (const el of elements) {
        if (!el.frameId) continue;
        const frame = frames.get(el.frameId);
        expect(frame, `${el.type} ссылается на несуществующий фрейм`).toBeDefined();
        if (!frame) continue;
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        expect(cx >= frame.x && cx <= frame.x + frame.width && cy >= frame.y && cy <= frame.y + frame.height).toBe(true);
      }
    });
  }
});

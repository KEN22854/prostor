import { describe, expect, it, vi } from 'vitest';

// Konva в Node без пакета canvas не нужен для проверки чистой функции интерполяции
vi.mock('konva', () => ({ default: {} }));

const { stepToward } = await import('./cursors-renderer');

describe('stepToward (интерполяция курсора)', () => {
  it('плавно приближается к цели и сходится', () => {
    let pos = { x: 0, y: 0 };
    const target = { x: 100, y: 50 };
    let steps = 0;
    for (;;) {
      const next = stepToward(pos, target, 1);
      if (!next) break;
      // каждый шаг строго ближе к цели
      expect(Math.hypot(target.x - next.x, target.y - next.y)).toBeLessThan(
        Math.hypot(target.x - pos.x, target.y - pos.y),
      );
      pos = next;
      steps++;
      if (steps > 100) throw new Error('не сходится');
    }
    expect(steps).toBeGreaterThan(3);
    expect(pos.x).toBeCloseTo(100, 1);
  });

  it('далёкий переход — мгновенный, без «полёта» через доску', () => {
    expect(stepToward({ x: 0, y: 0 }, { x: 5000, y: 0 }, 1)).toEqual({ x: 5000, y: 0 });
  });

  it('порог телепорта считается в экранных пикселях', () => {
    // 1000 мировых единиц при zoom 0.1 — это 100 px на экране: интерполируем
    const next = stepToward({ x: 0, y: 0 }, { x: 1000, y: 0 }, 0.1);
    expect(next?.x).toBeGreaterThan(0);
    expect(next?.x).toBeLessThan(1000);
  });

  it('на месте — null (не перерисовываем слой)', () => {
    expect(stepToward({ x: 1, y: 1 }, { x: 1, y: 1 }, 1)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { LASER_LIFETIME_MS, pruneTrail, toLocalTime } from '@/lib/canvas/laser-trail';
import { cameraForViewport, countFollowers, findFollowTarget, findPresenter, lerpCamera } from './follow';

describe('follow-mode', () => {
  it('показывает ту же область: центр совпадает, экран ведущего целиком помещается', () => {
    // Ведущий: экран 2000×1000 при zoom 2 → видит мир 1000×500 с левым верхним углом (100, 50)
    const cam = cameraForViewport({ x: 100, y: 50, zoom: 2, width: 2000, height: 1000 }, { width: 800, height: 800 });
    expect(cam.zoom).toBeCloseTo(0.8);
    const centerX = cam.x + 800 / 2 / cam.zoom;
    const centerY = cam.y + 800 / 2 / cam.zoom;
    expect(centerX).toBeCloseTo(600);
    expect(centerY).toBeCloseTo(300);
  });

  it('интерполяция масштаба логарифмическая', () => {
    const mid = lerpCamera({ x: 0, y: 0, zoom: 1 }, { x: 100, y: 0, zoom: 4 }, 0.5);
    expect(mid.x).toBe(50);
    expect(mid.zoom).toBeCloseTo(2);
  });

  it('ведущий показа, цель следования и число следящих по awareness', () => {
    const doc = new Y.Doc();
    const me = new Awareness(doc);
    me.setLocalState({ user: { id: 'me', name: 'Я', color: '#000' }, following: null, presenting: null, viewport: null });
    const viewport = { x: 0, y: 0, zoom: 1, width: 100, height: 100 };
    // Чужие состояния — прямо в карту states (как после применения апдейта)
    me.getStates().set(101, { user: { id: 'anna', name: 'Анна', color: '#f00' }, viewport, presenting: { since: 5 }, following: null });
    me.getStates().set(102, { user: { id: 'ivan', name: 'Иван', color: '#0f0' }, viewport, presenting: null, following: 'me' });
    expect(findPresenter(me, 'me')?.user.name).toBe('Анна');
    expect(findFollowTarget(me, 'ivan')?.user.clientId).toBe(102);
    expect(findFollowTarget(me, 'nobody')).toBeNull();
    expect(countFollowers(me, 'me')).toBe(1);
  });
});

describe('лазерная указка', () => {
  it('след живёт секунду, удалённое время переводится в локальное', () => {
    const now = 10_000;
    const pts = [
      { x: 0, y: 0, t: now - LASER_LIFETIME_MS - 1 },
      { x: 1, y: 1, t: now - 10 },
    ];
    expect(pruneTrail(pts, now)).toEqual([{ x: 1, y: 1, t: now - 10 }]);
    // Часы отправителя убежали на час — важна только разница между точками
    const local = toLocalTime([[0, 0, 3_600_000], [5, 5, 3_600_200]], now);
    expect(local.map((p) => p.t)).toEqual([now - 200, now]);
  });
});

import Konva from 'konva';
import type { BoardElement } from '@prostor/shared';

/**
 * Мягкое появление только что созданного объекта (своего или коллеги):
 * лёгкое «выпрыгивание» из 85% с проявлением.
 *
 * Не анимируем: загрузку доски (объекты старше пары секунд), линии и росчерки
 * (у них уже был предпросмотр при рисовании) и массовые вставки — шаблоны,
 * вставка сотен объектов, тесты на 10 000 — там анимация только тормозит.
 */
const FRESH_MS = 2000;
const BURST_WINDOW_MS = 300;
const BURST_LIMIT = 24;
const ANIMATED: ReadonlySet<BoardElement['type']> = new Set([
  'sticky',
  'shape',
  'text',
  'image',
  'frame',
  'table',
  'audio',
  'embed',
  'chart',
]);

let burstStart = 0;
let burstCount = 0;

function allowInBurst(now: number): boolean {
  if (now - burstStart > BURST_WINDOW_MS) {
    burstStart = now;
    burstCount = 0;
  }
  burstCount++;
  return burstCount <= BURST_LIMIT;
}

export function animateAppear(el: BoardElement): void {
  const now = Date.now();
  if (!ANIMATED.has(el.type) || now - el.createdAt > FRESH_MS) return;
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!allowInBurst(now)) return;

  // Узел объекта — Group с id элемента на основном (видимом) холсте
  const stage = Konva.stages.find((s) => s.container().isConnected && s.width() > 0);
  const node = stage?.findOne((n: Konva.Node) => n.id() === el.id);
  if (!node || !node.getLayer()) return;
  if (node.scaleX() !== 1 || node.scaleY() !== 1) return;

  const from = 0.85;
  const x = node.x();
  const y = node.y();
  const opacity = node.opacity();
  const w = 'width' in el ? el.width : 0;
  const h = 'height' in el ? el.height : 0;
  // Растём из центра: сдвигаем на недостающую от масштаба половину размера
  node.setAttrs({
    opacity: 0,
    scaleX: from,
    scaleY: from,
    x: x + (w * (1 - from)) / 2,
    y: y + (h * (1 - from)) / 2,
  });
  const tween = new Konva.Tween({
    node,
    duration: 0.38,
    easing: Konva.Easings.BackEaseOut,
    opacity,
    scaleX: 1,
    scaleY: 1,
    x,
    y,
    onFinish: () => tween.destroy(),
  });
  tween.play();
}

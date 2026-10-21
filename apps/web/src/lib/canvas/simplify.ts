/**
 * Упрощение росчерка (Ramer–Douglas–Peucker) по плоскому массиву [x0, y0, x1, y1, …].
 *
 * Мышь даёт 60–240 точек в секунду; без упрощения один росчерк — тысячи
 * чисел в Yjs-документе и тяжёлая отрисовка. epsilon — допуск в мировых
 * единицах (вызывающий передаёт ~1 px / zoom: визуально форма не меняется).
 * Итеративная версия — без риска переполнения стека на длинных росчерках.
 */
export function simplifyPoints(points: readonly number[], epsilon: number): number[] {
  const n = Math.floor(points.length / 2);
  if (n <= 2) return points.slice(0, n * 2);

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const eps2 = epsilon * epsilon;
  const stack: Array<[number, number]> = [[0, n - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number];
    const ax = points[start * 2] ?? 0;
    const ay = points[start * 2 + 1] ?? 0;
    const bx = points[end * 2] ?? 0;
    const by = points[end * 2 + 1] ?? 0;
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;

    let maxDist = -1;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const px = points[i * 2] ?? 0;
      const py = points[i * 2 + 1] ?? 0;
      let t = len === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > eps2) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }

  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) result.push(points[i * 2] ?? 0, points[i * 2 + 1] ?? 0);
  }
  return result;
}

/** Сколько живёт точка следа лазерной указки, мс */
export const LASER_LIFETIME_MS = 1_000;

export type TrailPoint = { x: number; y: number; t: number };

/** Точки старше времени жизни отбрасываем */
export function pruneTrail(points: TrailPoint[], now: number): TrailPoint[] {
  let i = 0;
  while (i < points.length && now - (points[i]?.t ?? 0) > LASER_LIFETIME_MS) i++;
  return i === 0 ? points : points.slice(i);
}

/**
 * Удалённые точки приходят со временем по часам отправителя. Часы клиентов
 * расходятся, поэтому переводим в локальное время относительно последней
 * точки: она «только что» нарисована.
 */
export function toLocalTime(
  raw: ReadonlyArray<readonly [number, number, number]>,
  now: number,
): TrailPoint[] {
  const last = raw[raw.length - 1]?.[2] ?? 0;
  return raw.map(([x, y, t]) => ({ x, y, t: now - (last - t) }));
}

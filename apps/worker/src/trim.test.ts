import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { trimTransparent } from './trim';

/** RGBA PNG: непрозрачный прямоугольник (rx, ry, rw, rh) на прозрачном фоне */
function pngWithRect(
  w: number,
  h: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): Uint8Array {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inside = x >= rx && x < rx + rw && y >= ry && y < ry + rh;
      png.data[i] = 200;
      png.data[i + 1] = 50;
      png.data[i + 2] = 50;
      png.data[i + 3] = inside ? 255 : 0;
    }
  }
  return new Uint8Array(PNG.sync.write(png));
}

describe('trimTransparent', () => {
  it('обрезает прозрачные поля с запасом 4 px и возвращает прямоугольник в пикселях исходника', () => {
    const result = trimTransparent(pngWithRect(200, 100, 50, 30, 40, 20));
    expect(result?.crop).toEqual({ x: 46, y: 26, width: 48, height: 28 });
    const out = PNG.sync.read(Buffer.from(result!.png));
    expect([out.width, out.height]).toEqual([48, 28]);
    // В центре — объект, в углу — прозрачный запас
    expect(out.data[(14 * 48 + 24) * 4 + 3]).toBe(255);
    expect(out.data[3]).toBe(0);
  });

  it('объект у края: запас не выходит за границы изображения', () => {
    const result = trimTransparent(pngWithRect(100, 100, 0, 0, 10, 10));
    expect(result?.crop).toEqual({ x: 0, y: 0, width: 14, height: 14 });
  });

  it('нечего обрезать или всё прозрачно — null', () => {
    expect(trimTransparent(pngWithRect(50, 50, 0, 0, 50, 50))).toBeNull();
    expect(trimTransparent(pngWithRect(50, 50, 0, 0, 0, 0))).toBeNull();
  });

  it('не PNG — null, а не исключение', () => {
    expect(trimTransparent(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
  });
});

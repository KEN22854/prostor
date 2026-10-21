import { describe, expect, it } from 'vitest';
import { isStickerId, stickerQuery } from '@/lib/stickers';
import { fontFamilyName, fontFormat } from '@/services/fonts';
import { iconToSvg, svgSize } from '@/services/stickers';

describe('стикеры', () => {
  it('русский запрос переводится словарём, латиница — как есть', () => {
    expect(stickerQuery('кот')).toBe('cat');
    expect(stickerQuery('  Сердце ')).toBe('heart');
    expect(stickerQuery('рыжий кот')).toBe('cat');
    expect(stickerQuery('rocket')).toBe('rocket');
    expect(stickerQuery('абракадабра')).toBe('');
  });

  it('id — только разрешённые наборы и безопасные имена', () => {
    expect(isStickerId('noto:cat-face')).toBe(true);
    expect(isStickerId('mdi:cat')).toBe(false);
    expect(isStickerId('noto:../etc')).toBe(false);
  });

  it('SVG из данных Iconify: viewBox и тело; со скриптом — отказ', () => {
    const svg = iconToSvg({ body: '<path d="M0 0h1"/>' }, { width: 128, height: 128 });
    expect(svg).toContain('viewBox="0 0 128 128"');
    expect(svg).toContain('<path d="M0 0h1"/>');
    expect(iconToSvg({ body: '<script>alert(1)</script>' }, {})).toBeNull();
    expect(iconToSvg({ body: '<path onload="x()"/>' }, {})).toBeNull();
  });

  it('размер растра — 512 по большей стороне с сохранением пропорций', () => {
    expect(svgSize('<svg viewBox="0 0 36 36">')).toEqual({ width: 512, height: 512 });
    expect(svgSize('<svg viewBox="0 0 64 32">')).toEqual({ width: 512, height: 256 });
  });
});

describe('свои шрифты', () => {
  const bytes = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

  it('формат по сигнатуре файла', () => {
    expect(fontFormat(bytes('wOF2....'))?.mime).toBe('font/woff2');
    expect(fontFormat(bytes('wOFF....'))?.mime).toBe('font/woff');
    expect(fontFormat(bytes('OTTO....'))?.mime).toBe('font/otf');
    expect(fontFormat(new Uint8Array([0, 1, 0, 0, 9]))?.mime).toBe('font/ttf');
    expect(fontFormat(bytes('<svg'))).toBeNull();
  });

  it('имя семейства без расширения и спецсимволов (оно попадает в CSS)', () => {
    expect(fontFamilyName('My_Brand-Font.woff2')).toBe('My Brand Font');
    expect(fontFamilyName('Мой «шрифт»; }')).toBe('Мой шрифт');
    expect(fontFamilyName('.ttf')).toBeNull();
  });
});

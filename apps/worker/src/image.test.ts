import { describe, expect, it } from 'vitest';
import { imageInfo } from './image-info';
import { encodePng } from './png';

describe('encodePng + imageInfo', () => {
  it('PNG: размеры читаются из IHDR', () => {
    const png = encodePng(37, 19, () => [255, 0, 0]);
    expect(imageInfo(png)).toEqual({ mimeType: 'image/png', width: 37, height: 19 });
  });

  it('GIF', () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xf0, 0x00]);
    expect(imageInfo(gif)).toEqual({ mimeType: 'image/gif', width: 320, height: 240 });
  });

  it('JPEG: размеры из SOF0 после APP0', () => {
    const jpeg = new Uint8Array([
      0xff,
      0xd8, // SOI
      0xff,
      0xe0,
      0x00,
      0x04,
      0x00,
      0x00, // APP0 (длина 4)
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08,
      0x01,
      0xe0,
      0x02,
      0x80,
      0x03, // SOF0: h=480, w=640
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
    expect(imageInfo(jpeg)).toEqual({ mimeType: 'image/jpeg', width: 640, height: 480 });
  });

  it('WebP VP8X', () => {
    const webp = new Uint8Array(30);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    webp.set([0x56, 0x50, 0x38, 0x58], 12); // 'VP8X'
    webp.set([0xff, 0x03, 0x00], 24); // width-1 = 1023
    webp.set([0x57, 0x02, 0x00], 27); // height-1 = 599
    expect(imageInfo(webp)).toEqual({ mimeType: 'image/webp', width: 1024, height: 600 });
  });

  it('мусор — null', () => {
    expect(imageInfo(new TextEncoder().encode('<html>error</html>'))).toBeNull();
  });
});

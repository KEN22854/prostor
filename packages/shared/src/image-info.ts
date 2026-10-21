export interface ImageInfo {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  width: number;
  height: number;
}

/**
 * Формат и размеры изображения по заголовку файла — без декодирования
 * и без нативных зависимостей (sharp тянул бы ~30 МБ бинарей в образ worker).
 * Ответам провайдеров не доверяем: тип и размер определяем сами.
 */
export function imageInfo(bytes: Uint8Array): ImageInfo | null {
  const b = (i: number) => bytes[i] ?? 0;
  const u16be = (i: number) => (b(i) << 8) | b(i + 1);
  const u32be = (i: number) => ((b(i) << 24) >>> 0) + (b(i + 1) << 16) + (b(i + 2) << 8) + b(i + 3);
  const u16le = (i: number) => b(i) | (b(i + 1) << 8);
  const u24le = (i: number) => b(i) | (b(i + 1) << 8) | (b(i + 2) << 16);

  // PNG: сигнатура + IHDR
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) {
    return { mimeType: 'image/png', width: u32be(16), height: u32be(20) };
  }

  // GIF: логический экран
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46) {
    return { mimeType: 'image/gif', width: u16le(6), height: u16le(8) };
  }

  // WebP: RIFF....WEBP + VP8 / VP8L / VP8X
  if (
    b(0) === 0x52 &&
    b(1) === 0x49 &&
    b(2) === 0x46 &&
    b(3) === 0x46 &&
    b(8) === 0x57 &&
    b(9) === 0x45
  ) {
    const chunk = String.fromCharCode(b(12), b(13), b(14), b(15));
    if (chunk === 'VP8 ')
      return { mimeType: 'image/webp', width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const bits = b(21) | (b(22) << 8) | (b(23) << 16) | (b(24) << 24);
      return {
        mimeType: 'image/webp',
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    if (chunk === 'VP8X')
      return { mimeType: 'image/webp', width: u24le(24) + 1, height: u24le(27) + 1 };
    return null;
  }

  // JPEG: ищем маркер SOFn (кадр) — в нём размеры
  if (b(0) === 0xff && b(1) === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (b(i) !== 0xff) {
        i++;
        continue;
      }
      const marker = b(i + 1);
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { mimeType: 'image/jpeg', height: u16be(i + 5), width: u16be(i + 7) };
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      i += 2 + u16be(i + 2);
    }
    return null;
  }

  return null;
}

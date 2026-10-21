'use client';

import type { BoardElement } from '@prostor/shared';
import { buildFrame, buildImage } from '@/lib/canvas/element-factory';
import { uploadImage } from '@/lib/canvas/image-upload';

export const MAX_PDF_BYTES = 50 * 1024 * 1024;
export const MAX_PDF_PAGES = 50;
/** Ширина страницы на доске (мировые единицы) */
const PAGE_WIDTH = 800;
const GAP = 80;
const COLUMNS = 4;
/** Растр страницы: не больше 2000 px по большей стороне — чётко и не слишком тяжело */
const MAX_RASTER = 2000;

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export interface PdfPage {
  assetId: string;
  width: number;
  height: number;
}

/**
 * Страницы PDF → изображения на сервере (через обычную загрузку ассетов).
 * Рендер — в браузере (pdf.js): сервер не разбирает чужие PDF, а на доске
 * остаются обычные картинки, которые видят все клиенты и экспорт.
 */
export async function rasterizePdf(
  file: File,
  boardId: string,
  onProgress: (done: number, total: number) => void,
): Promise<PdfPage[]> {
  if (file.size > MAX_PDF_BYTES) throw new Error('PDF больше 50 МБ');
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  // isEvalSupported: false — защита от исполнения кода из шрифтов PDF (CVE-2024-4367)
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  try {
    const total = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const pages: PdfPage[] = [];
    for (let n = 1; n <= total; n++) {
      onProgress(n - 1, total);
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(3, MAX_RASTER / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas недоступен');
      // Белая подложка: у многих PDF прозрачный фон
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      page.cleanup();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось отрисовать страницу'))), 'image/jpeg', 0.88),
      );
      const asset = await uploadImage(boardId, new File([blob], `${file.name}-p${n}.jpg`, { type: 'image/jpeg' }));
      pages.push({ assetId: asset.id, width: asset.width, height: asset.height });
    }
    onProgress(total, total);
    return pages;
  } finally {
    void pdf.destroy();
  }
}

/** Раскладка: страница — фрейм с картинкой, по 4 в ряд, начиная с точки at */
export function layoutPdfPages(
  pages: readonly PdfPage[],
  opts: { at: { x: number; y: number }; name: string; userId: string; nextZ: () => string },
): BoardElement[] {
  const elements: BoardElement[] = [];
  let rowTop = opts.at.y;
  let rowHeight = 0;
  pages.forEach((p, i) => {
    const col = i % COLUMNS;
    if (col === 0 && i > 0) {
      rowTop += rowHeight + GAP;
      rowHeight = 0;
    }
    const height = Math.round((p.height / p.width) * PAGE_WIDTH);
    rowHeight = Math.max(rowHeight, height);
    const x = opts.at.x + col * (PAGE_WIDTH + GAP);
    const frame = buildFrame({
      x,
      y: rowTop,
      width: PAGE_WIDTH,
      height,
      title: `${opts.name} — стр. ${i + 1}`,
      userId: opts.userId,
      zIndex: opts.nextZ(),
    });
    const image = buildImage({
      x,
      y: rowTop,
      width: PAGE_WIDTH,
      height,
      assetId: p.assetId,
      naturalWidth: p.width,
      naturalHeight: p.height,
      alt: `${opts.name}, страница ${i + 1}`,
      userId: opts.userId,
      zIndex: opts.nextZ(),
    });
    elements.push(frame, { ...image, frameId: frame.id });
  });
  return elements;
}

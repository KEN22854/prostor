'use client';

import { canvasFont } from '@/lib/canvas/fonts';
import type { ExportPage } from '@/lib/export/export-pages';
import { safeFileName, safeScale } from '@/lib/export/export-pages';
import { imagesAsDataUrls } from '@/lib/export/preloaded-images';
import { canvasToBlob, renderPageToCanvas } from '@/lib/export/render-raster';
import type { PdfPageInput, PdfWorkerRequest, PdfWorkerResponse } from '@/lib/export/pdf.worker';
import { elementsToSvg } from '@/lib/export/svg';

export type ExportFormat = 'png' | 'pdf' | 'svg';

export interface ExportOptions {
  format: ExportFormat;
  pages: ExportPage[];
  /** Масштаб PNG (1×, 2×, 4×); PDF всегда 2× — чёткий текст при печати */
  scale: number;
  /** null — прозрачный фон (PNG, SVG) */
  background: string | null;
  fileName: string;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Даём браузеру начать загрузку, прежде чем освободить URL
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

let measureCtx: CanvasRenderingContext2D | null = null;

/** Ширина текста тем же шрифтом, каким рисует холст (для переносов в SVG) */
function measure(text: string, font: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * 8;
  // Семейство в SVG — переносимое «Inter, …», а меряем реальным шрифтом страницы
  const prefix = /^(.*?\d+(?:\.\d+)?px)/.exec(font)?.[1] ?? '16px';
  measureCtx.font = `${prefix} ${canvasFont('Inter')}`;
  return measureCtx.measureText(text).width;
}

async function exportPng(opts: ExportOptions): Promise<void> {
  const page = opts.pages[0];
  if (!page) return;
  const canvas = await renderPageToCanvas(page, {
    scale: safeScale(page.bounds, opts.scale),
    background: opts.background,
  });
  downloadBlob(await canvasToBlob(canvas), `${safeFileName(opts.fileName)}.png`);
}

/** Упаковка страниц в PDF в Web Worker (jsPDF грузится только там) */
function assemblePdf(pages: PdfPageInput[]): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<PdfWorkerResponse>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.pdf);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Не удалось собрать PDF'));
    };
    worker.postMessage(
      { pages } satisfies PdfWorkerRequest,
      pages.map((p) => p.jpeg),
    );
  });
}

async function exportPdf(opts: ExportOptions): Promise<void> {
  const pages: PdfPageInput[] = [];
  for (const page of opts.pages) {
    const w = page.bounds.maxX - page.bounds.minX;
    const h = page.bounds.maxY - page.bounds.minY;
    const canvas = await renderPageToCanvas(page, {
      scale: safeScale(page.bounds, 2),
      background: '#ffffff',
    });
    // JPEG заметно компактнее PNG для страниц с фотографиями; фон всё равно белый.
    // toBlob кодирует асинхронно (toDataURL блокировал бы главный поток на секунды)
    const jpeg = await (await canvasToBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer();
    // Размер страницы — по фрейму (1 px доски = 0,75 pt, как у браузера при печати)
    pages.push({ jpeg, width: w * 0.75, height: h * 0.75 });
  }
  if (pages.length === 0) return;
  const pdf = await assemblePdf(pages);
  downloadBlob(new Blob([pdf], { type: 'application/pdf' }), `${safeFileName(opts.fileName)}.pdf`);
}

async function exportSvg(opts: ExportOptions): Promise<void> {
  const page = opts.pages[0];
  if (!page) return;
  await document.fonts?.ready;
  const svg = elementsToSvg(page.elements, {
    bounds: page.bounds,
    background: opts.background,
    images: await imagesAsDataUrls(page.elements),
    measure,
  });
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${safeFileName(opts.fileName)}.svg`);
}

export async function exportBoard(opts: ExportOptions): Promise<void> {
  if (opts.pages.length === 0) throw new Error('Нечего экспортировать');
  if (opts.format === 'png') return exportPng(opts);
  if (opts.format === 'pdf') return exportPdf(opts);
  return exportSvg(opts);
}

/// <reference lib="webworker" />
import { jsPDF } from 'jspdf';

/**
 * Сборка PDF в Web Worker: страницы приходят готовыми JPEG (canvas.toBlob —
 * асинхронно, вне главного потока), здесь — только упаковка в PDF. На больших
 * досках это секунды работы, которые больше не замораживают интерфейс.
 */
export interface PdfPageInput {
  jpeg: ArrayBuffer;
  /** Размер страницы в пунктах */
  width: number;
  height: number;
}

export type PdfWorkerRequest = { pages: PdfPageInput[] };
export type PdfWorkerResponse = { ok: true; pdf: ArrayBuffer } | { ok: false; error: string };

self.onmessage = (event: MessageEvent<PdfWorkerRequest>) => {
  try {
    let pdf: jsPDF | null = null;
    for (const page of event.data.pages) {
      const format: [number, number] = [page.width, page.height];
      const orientation = page.width >= page.height ? 'landscape' : 'portrait';
      if (!pdf) pdf = new jsPDF({ orientation, unit: 'pt', format, compress: true });
      else pdf.addPage(format, orientation);
      pdf.addImage(new Uint8Array(page.jpeg), 'JPEG', 0, 0, page.width, page.height);
    }
    if (!pdf) throw new Error('Нет страниц');
    const out = pdf.output('arraybuffer');
    (self as unknown as Worker).postMessage({ ok: true, pdf: out } satisfies PdfWorkerResponse, [out]);
  } catch (error: unknown) {
    (self as unknown as Worker).postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies PdfWorkerResponse);
  }
};

'use client';

import { useEffect, type RefObject } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { looksLikeUrl } from '@prostor/shared';
import { FEED_DRAG_TYPE } from '@/hooks/use-feed-insert';
import type { FeedImage } from '@/lib/image-feed';
import type { BoardActions } from '@/lib/canvas/board-actions';
import { buildText, nextZIndex } from '@/lib/canvas/element-factory';
import { isTypingTarget } from '@/lib/canvas/keyboard';
import { isPdf } from '@/lib/import/pdf-import';
import { placeAt, zSequence } from '@/lib/import/common';
import { useT } from '@/lib/i18n/client';
import { centerOn, screenToWorld, visibleBounds, type Point } from '@/lib/canvas/viewport';
import { useCanvasStore } from '@/stores/canvas-store';

interface ClipboardDeps {
  containerRef: RefObject<HTMLElement | null>;
  actions: BoardActions | null;
  doc: Y.Doc | null;
  userId: string | null;
  insertImages: (files: readonly File[], at: Point) => Promise<void>;
  /** Импорт PDF, брошенного на холст */
  importPdf?: (file: File, at: Point) => Promise<void>;
  /** Вставленная ссылка — карточка с превью (YouTube, Figma, сайт) */
  insertEmbed?: (url: string, at: Point) => Promise<void>;
  /** Картинка, перетащенная из ленты */
  insertFeedImage?: (img: FeedImage, at: Point) => Promise<void>;
  /** Аудиофайл, брошенный на холст */
  insertAudio?: (file: Blob, at: Point) => Promise<void>;
  insertVideo?: (file: Blob, at: Point) => Promise<void>;
}

const MAX_PLAIN_TEXT = 10_000;

/** Картинка из HTML буфера (копирование картинки со страницы или доски без файла) */
async function htmlImage(html: string): Promise<File | null> {
  const src = /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1]?.replace(/&amp;/g, '&');
  if (!src || !/^(data:image\/|https?:)/.test(src)) return null;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    return new File([blob], 'image', { type: blob.type });
  } catch {
    // Чужой сервер без CORS — картинку не достать
    return null;
  }
}

/**
 * Копирование, вырезание и вставка через события copy/cut/paste.
 *
 * Почему события, а не navigator.clipboard: Clipboard API требует разрешения
 * и не везде доступен (Яндекс.Браузер, http в локальной сети on-prem),
 * а clipboardData в событии работает всегда и синхронно.
 *
 * Вставка: наши объекты (JSON с маркером) → копии под курсором;
 * объекты других досок (Miro, Excalidraw, draw.io, Holst…) → элементы доски;
 * картинки → загрузка; обычный текст → текстовый блок.
 * Перетаскивание файлов на холст — там же.
 */
export function useBoardClipboard({
  containerRef,
  actions,
  doc,
  userId,
  insertImages,
  importPdf,
  insertEmbed,
  insertFeedImage,
  insertAudio,
  insertVideo,
}: ClipboardDeps): void {
  const t = useT();
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let pointer: Point | null = null;

    const onPointerMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      pointer = screenToWorld(useCanvasStore.getState().camera, {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };
    const onPointerLeave = () => {
      pointer = null;
    };

    /** Точка вставки: курсор над холстом или центр экрана */
    const insertionPoint = (): Point => {
      if (pointer) return pointer;
      const { camera, size } = useCanvasStore.getState();
      const v = visibleBounds(camera, size);
      return { x: (v.minX + v.maxX) / 2, y: (v.minY + v.maxY) / 2 };
    };

    const onCopy = (e: ClipboardEvent, cut = false) => {
      if (isTypingTarget(e.target) || !actions) return;
      const { selection, select } = useCanvasStore.getState();
      if (selection.length === 0) return;
      const text = actions.serialize(selection);
      if (!text) {
        e.preventDefault();
        toast.error('Копирование запрещено настройками организации');
        return;
      }
      e.clipboardData?.setData('text/plain', text);
      e.preventDefault();
      if (cut) {
        actions.delete(selection);
        select([]);
      }
    };

    /** Объекты с другой доски (Miro, Excalidraw, draw.io, Holst…) — элементами доски */
    const pasteForeign = async (html: string, text: string, at: Point): Promise<boolean> => {
      if (!actions || !doc || !userId) return false;
      const { importForeignClipboard } = await import('@/lib/import/foreign-clipboard');
      const ctx = { userId, z: zSequence(nextZIndex(doc)) };
      const result = await importForeignClipboard({ html, text }, ctx);
      if (!result || result.elements.length === 0) return false;
      const ids = actions.create(placeAt(result.elements, at));
      useCanvasStore.getState().select(ids);
      if (result.skipped > 0)
        toast.message(
          t('Вставлено объектов: {n}, пропущено: {skipped}', {
            n: ids.length,
            skipped: result.skipped,
          }),
        );
      return true;
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target) || !actions?.canEdit) return;
      const data = e.clipboardData;
      if (!data) return;
      const files = Array.from(data.files).filter((f) => f.type.startsWith('image/'));
      const text = data.getData('text/plain');
      const html = data.getData('text/html');
      const at = insertionPoint();
      // Свои объекты — сразу копиями
      if (text) {
        const pasted = actions.paste(text, at);
        if (pasted) {
          e.preventDefault();
          useCanvasStore.getState().select(pasted);
          return;
        }
      }
      if (!text && !html && files.length === 0) return;
      e.preventDefault();
      void (async () => {
        // Объекты другой доски важнее картинки-снимка, которую она кладёт рядом
        if (await pasteForeign(html, text, at)) return;
        if (files.length > 0) return insertImages(files, at);
        if (!text) {
          const img = await htmlImage(html);
          if (img) return insertImages([img], at);
        }
        if (text) pasteText(text, at);
      })();
    };

    const pasteText = (text: string, at: Point) => {
      if (!actions) return;
      // Одна ссылка — карточка с превью
      if (insertEmbed && looksLikeUrl(text)) {
        void insertEmbed(text.trim(), at);
        return;
      }
      // Обычный текст — новый текстовый блок
      if (!doc || !userId) return;
      const block = buildText({
        x: at.x,
        y: at.y,
        userId,
        zIndex: nextZIndex(doc),
        text: text.slice(0, MAX_PLAIN_TEXT),
      });
      const lines = block.text.split('\n').length;
      const ids = actions.create([{ ...block, height: Math.ceil(block.fontSize * 1.3 * lines) }]);
      useCanvasStore.getState().select(ids);
    };

    const onDragOver = (e: DragEvent) => {
      if (
        e.dataTransfer?.types.includes('Files') ||
        e.dataTransfer?.types.includes(FEED_DRAG_TYPE)
      ) {
        e.preventDefault();
        e.dataTransfer.dropEffect = actions?.canEdit ? 'copy' : 'none';
      }
    };
    const onDrop = (e: DragEvent) => {
      // Картинка из ленты — точка броска на доске
      const feed = e.dataTransfer?.getData(FEED_DRAG_TYPE);
      if (feed) {
        e.preventDefault();
        if (!actions?.canEdit || !insertFeedImage) return;
        const rect = el.getBoundingClientRect();
        const at = screenToWorld(useCanvasStore.getState().camera, {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        void insertFeedImage(JSON.parse(feed) as FeedImage, at);
        return;
      }
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      e.preventDefault();
      if (!actions?.canEdit) return;
      const rect = el.getBoundingClientRect();
      const { camera, size, setCamera } = useCanvasStore.getState();
      const at = screenToWorld(camera, { x: e.clientX - rect.left, y: e.clientY - rect.top });
      // PDF — постранично фреймами, остальное — как изображения
      for (const pdf of files.filter(isPdf)) void importPdf?.(pdf, at);
      // Аудио — карточками со смещением, чтобы не легли друг на друга
      files
        .filter((f) => f.type.startsWith('audio/'))
        .forEach((f, i) => void insertAudio?.(f, { x: at.x, y: at.y + i * 96 }));
      // Видео — карточками с обложкой
      files
        .filter((f) => f.type.startsWith('video/'))
        .forEach((f, i) => void insertVideo?.(f, { x: at.x + i * 40, y: at.y + i * 40 }));
      const images = files.filter(
        (f) => !isPdf(f) && !f.type.startsWith('audio/') && !f.type.startsWith('video/'),
      );
      if (images.length > 0) void insertImages(images, at);
      // Если бросили у самого края — подвинем камеру, чтобы картинка была видна
      if (e.clientX - rect.left < 40 || e.clientY - rect.top < 40)
        setCamera((c) => centerOn(c, size, at));
    };

    const copy = (e: ClipboardEvent) => onCopy(e);
    const cut = (e: ClipboardEvent) => onCopy(e, true);
    document.addEventListener('copy', copy);
    document.addEventListener('cut', cut);
    document.addEventListener('paste', onPaste);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerleave', onPointerLeave);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('copy', copy);
      document.removeEventListener('cut', cut);
      document.removeEventListener('paste', onPaste);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerleave', onPointerLeave);
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('drop', onDrop);
    };
  }, [
    containerRef,
    actions,
    doc,
    userId,
    insertImages,
    importPdf,
    insertEmbed,
    insertFeedImage,
    insertAudio,
    insertVideo,
    t,
  ]);
}

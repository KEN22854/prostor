'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import type { BoardActions } from '@/lib/canvas/board-actions';
import type { ElementStore } from '@/lib/canvas/element-store';
import { isModKey, isTypingTarget } from '@/lib/canvas/keyboard';
import { CREATION_TOOLS, useCanvasStore, type CanvasTool } from '@/stores/canvas-store';
import { useCommentsStore } from '@/stores/comments-store';
import type { ShapeElement } from '@prostor/shared';

interface HotkeyDeps {
  actions: BoardActions | null;
  store: ElementStore | null;
  undoManager: Y.UndoManager | null;
  openImagePicker: () => void;
}

/** Клавиша → инструмент (без модификаторов) */
const TOOL_KEYS: Record<string, { tool: CanvasTool; shape?: ShapeElement['shape'] }> = {
  v: { tool: 'select' },
  h: { tool: 'hand' },
  n: { tool: 'sticky' },
  r: { tool: 'shape', shape: 'rect' },
  o: { tool: 'shape', shape: 'ellipse' },
  t: { tool: 'text' },
  l: { tool: 'line' },
  a: { tool: 'arrow' },
  p: { tool: 'pen' },
  e: { tool: 'eraser' },
  i: { tool: 'image' },
  f: { tool: 'frame' },
  c: { tool: 'comment' },
  k: { tool: 'laser' },
};

/** Раскладка: в русской раскладке e.key — кириллица, поэтому используем e.code */
function letter(e: KeyboardEvent): string | null {
  const m = /^Key([A-Z])$/.exec(e.code);
  return m?.[1]?.toLowerCase() ?? null;
}

/**
 * Горячие клавиши доски: Delete, Ctrl+A/D/G/Z/Y, стрелки, Enter, инструменты.
 * Копирование/вставка — через события copy/paste (use-board-clipboard).
 */
export function useBoardHotkeys({
  actions,
  store,
  undoManager,
  openImagePicker,
}: HotkeyDeps): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      // В режиме презентации клавиши обрабатывает только он
      if (useCanvasStore.getState().presentation) return;
      const s = useCanvasStore.getState();
      const selection = s.selection;
      const key = letter(e);
      const mod = isModKey(e);

      // ── Отмена / повтор ──
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) undoManager?.redo();
        else undoManager?.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        undoManager?.redo();
        return;
      }

      if (mod && key === 'a') {
        e.preventDefault();
        if (!store) return;
        const ids: string[] = [];
        for (const el of store.values()) if (!el.hidden) ids.push(el.id);
        s.setTool('select');
        s.select(ids);
        return;
      }

      if (!actions) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length > 0) {
        e.preventDefault();
        const { deleted, skipped } = actions.delete(selection);
        s.select([]);
        if (skipped > 0) {
          toast.warning(
            deleted > 0
              ? `Удалено: ${deleted}. Пропущено ${skipped} — заблокированы или созданы другими участниками`
              : 'Эти объекты нельзя удалить: они заблокированы или созданы другими участниками',
          );
        }
        return;
      }

      if (mod && key === 'd') {
        e.preventDefault();
        if (selection.length === 0) return;
        const copies = actions.duplicate(selection);
        if (copies.length > 0) s.select(copies);
        else if (!actions.canCopy) toast.error('Копирование запрещено настройками организации');
        return;
      }

      if (mod && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) actions.ungroup(selection);
        else if (actions.group(selection)) toast.success('Объекты сгруппированы');
        return;
      }

      if (mod && e.shiftKey && key === 'e') {
        e.preventDefault();
        if (actions.canExport) s.setPanel('export');
        return;
      }

      if (mod && e.shiftKey && key === 'l') {
        e.preventDefault();
        actions.toggleLock(selection);
        return;
      }

      if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {
        e.preventDefault();
        if (e.code === 'BracketRight') actions.bringToFront(selection);
        else actions.sendToBack(selection);
        return;
      }

      // Сдвиг стрелками: 1 px экрана, с Shift — 10
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const arrow = arrows[e.key];
      if (arrow && selection.length > 0 && !mod) {
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) / s.camera.zoom;
        actions.nudge(selection, arrow[0] * step, arrow[1] * step);
        return;
      }

      if (e.key === 'Enter' && selection.length === 1) {
        const el = store?.get(selection[0] ?? '');
        if (
          el &&
          (el.type === 'sticky' || el.type === 'text' || el.type === 'shape') &&
          !el.locked &&
          actions.canEdit
        ) {
          e.preventDefault();
          s.setEditing(el.id);
        }
        return;
      }

      if (e.key === 'Escape') {
        const comments = useCommentsStore.getState();
        if (comments.openThreadId || comments.draft) {
          comments.openThread(null);
          return;
        }
        if (selection.length > 0) s.select([]);
        else if (s.tool !== 'select') s.setTool('select');
        return;
      }

      // Shift+C — показать/скрыть комментарии
      if (!mod && e.shiftKey && key === 'c') {
        const comments = useCommentsStore.getState();
        comments.setVisible(!comments.visible);
        return;
      }

      if (!mod && !e.altKey && key) {
        const mapping = TOOL_KEYS[key];
        if (!mapping) return;
        if (CREATION_TOOLS.has(mapping.tool) && !actions.canEdit) return;
        if (mapping.tool === 'comment' && !actions.canComment) return;
        if (mapping.tool === 'image') {
          openImagePicker();
          return;
        }
        if (mapping.shape) s.setToolOptions({ shapeKind: mapping.shape });
        s.setTool(mapping.tool);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions, store, undoManager, openImagePicker]);
}

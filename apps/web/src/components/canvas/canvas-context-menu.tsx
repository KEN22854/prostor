'use client';

import {
  BringToFront,
  Copy,
  Group,
  Lock,
  LockOpen,
  Maximize,
  MousePointerSquareDashed,
  SendToBack,
  Trash2,
  Ungroup,
  Wand2,
} from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import type { AiCapabilities, BoardElement } from '@prostor/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { BoardActions } from '@/lib/canvas/board-actions';
import type { ElementStore } from '@/lib/canvas/element-store';
import { pointQuery, topmostAt } from '@/lib/canvas/hit-test';
import { isCanvasTarget } from '@/lib/canvas/keyboard';
import { screenToWorld } from '@/lib/canvas/viewport';
import { useAiStore } from '@/stores/ai-store';
import { useCanvasStore } from '@/stores/canvas-store';

interface CanvasContextMenuProps {
  containerRef: RefObject<HTMLElement | null>;
  store: ElementStore | null;
  actions: BoardActions | null;
  ai: AiCapabilities;
  onRemoveBg: (elementId: string) => void;
  onFit: () => void;
}

/**
 * Контекстное меню холста (правый клик / долгое нажатие на тач-экране).
 * Клик по невыделенному объекту сначала выделяет его — как в файловых
 * менеджерах. Для одиночного изображения — «Убрать фон».
 */
export function CanvasContextMenu({
  containerRef,
  store,
  actions,
  ai,
  onRemoveBg,
  onFit,
}: CanvasContextMenuProps) {
  const [menu, setMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);
  const aiTasks = useAiStore((s) => s.tasks);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !store) return;
    const onContextMenu = (e: MouseEvent) => {
      if (!isCanvasTarget(e, el)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const s = useCanvasStore.getState();
      const world = screenToWorld(s.camera, { x: e.clientX - rect.left, y: e.clientY - rect.top });
      const tolerance = 4 / s.camera.zoom;
      const hit = topmostAt(store.query(pointQuery(world, tolerance)), world, tolerance);
      let ids = s.selection;
      if (hit && !ids.includes(hit.id)) {
        ids = actions?.expandGroups([hit.id]) ?? [hit.id];
        s.select(ids);
      } else if (!hit) {
        ids = [];
        s.select([]);
      }
      if (s.tool !== 'select') s.setTool('select');
      setMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, ids: [...ids] });
    };
    el.addEventListener('contextmenu', onContextMenu);
    return () => el.removeEventListener('contextmenu', onContextMenu);
  }, [containerRef, store, actions]);

  if (!menu) return null;
  const elements = menu.ids
    .map((id) => store?.get(id))
    .filter((e): e is BoardElement => e !== undefined);
  const canEdit = actions?.canEdit ?? false;
  const single = elements.length === 1 ? elements[0] : undefined;
  const removeBgKey = single ? `remove-bg:${single.id}` : '';
  const close = () => setMenu(null);
  const ids = elements.map((e) => e.id);

  return (
    <DropdownMenu open onOpenChange={(open) => !open && close()}>
      <DropdownMenuTrigger asChild>
        <span
          className="pointer-events-none absolute size-px"
          style={{ left: menu.x, top: menu.y }}
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-56"
        onCloseAutoFocus={(e) => e.preventDefault()}
        data-testid="canvas-context-menu"
      >
        {elements.length === 0 ? (
          <>
            <DropdownMenuItem
              onSelect={() => {
                if (!store) return;
                const all: string[] = [];
                for (const el of store.values()) if (!el.hidden) all.push(el.id);
                useCanvasStore.getState().select(all);
              }}
            >
              <MousePointerSquareDashed /> Выделить всё
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onFit}>
              <Maximize /> Показать всё
            </DropdownMenuItem>
          </>
        ) : canEdit ? (
          <>
            {single?.type === 'image' && ai.removeBg ? (
              <>
                <DropdownMenuItem
                  disabled={Boolean(aiTasks[removeBgKey]) || single.locked}
                  onSelect={() => onRemoveBg(single.id)}
                >
                  <Wand2 /> Убрать фон
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem
              onSelect={() => {
                const copies = actions?.duplicate(ids) ?? [];
                if (copies.length > 0) useCanvasStore.getState().select(copies);
                else toast.error('Копирование запрещено настройками организации');
              }}
            >
              <Copy /> Дублировать{' '}
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+D</span>
            </DropdownMenuItem>
            {elements.some((e) => e.groupId) ? (
              <DropdownMenuItem onSelect={() => actions?.ungroup(ids)}>
                <Ungroup /> Разгруппировать
              </DropdownMenuItem>
            ) : elements.length > 1 ? (
              <DropdownMenuItem onSelect={() => actions?.group(ids)}>
                <Group /> Сгруппировать{' '}
                <span className="ml-auto text-xs text-muted-foreground">Ctrl+G</span>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => actions?.bringToFront(ids)}>
              <BringToFront /> На передний план
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions?.sendToBack(ids)}>
              <SendToBack /> На задний план
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions?.toggleLock(ids)}>
              {elements.every((e) => e.locked) ? (
                <>
                  <LockOpen /> Разблокировать
                </>
              ) : (
                <>
                  <Lock /> Заблокировать
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={() => {
                const { skipped } = actions?.delete(ids) ?? { skipped: 0 };
                useCanvasStore.getState().select([]);
                if (skipped > 0)
                  toast.warning(
                    `Пропущено ${skipped}: заблокированы или созданы другими участниками`,
                  );
              }}
            >
              <Trash2 /> Удалить <span className="ml-auto text-xs opacity-70">Del</span>
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onSelect={onFit}>
            <Maximize /> Показать всё
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

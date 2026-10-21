'use client';

import type Konva from 'konva';
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { Layer, Transformer } from 'react-konva';
import type { BoardElement, LineElement } from '@prostor/shared';
import { lineEnds } from '@/lib/canvas/connectors';
import type { BoardActions } from '@/lib/canvas/board-actions';
import type { DetailLevel } from '@/lib/canvas/constants';
import type { ElementStore } from '@/lib/canvas/element-store';
import type { OverlayRenderer } from '@/lib/canvas/overlay-renderer';
import { patchFromTransform } from '@/lib/canvas/transform-commit';
import { unionBounds } from '@/lib/canvas/viewport';
import { useCanvasStore } from '@/stores/canvas-store';

const ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315];

interface SelectionLayerProps {
  elementsLayer: RefObject<Konva.Layer | null>;
  transformerLayer: RefObject<Konva.Layer | null>;
  store: ElementStore | null;
  actions: BoardActions | null;
  overlay: OverlayRenderer | null;
  /** Текущая выборка — после её смены ноды пересоздаются и Transformer переподключается */
  elements: readonly BoardElement[];
  detail: DetailLevel;
}

/**
 * Выделение: Konva.Transformer (8 ручек + поворот) на отрисованных нодах
 * выделенных элементов. Сам Transformer — в отдельном слое со своим
 * hit-графом (он маленький), слой элементов остаётся неинтерактивным.
 *
 * Если часть выделения не отрисована (виртуализация, LOD) или заблокирована,
 * дополнительно рисуется общая рамка по габаритам из R-tree.
 */
export function SelectionLayer({
  elementsLayer,
  transformerLayer,
  store,
  actions,
  overlay,
  elements,
  detail,
}: SelectionLayerProps) {
  const trRef = useRef<Konva.Transformer>(null);
  const selection = useCanvasStore((s) => s.selection);
  const editingId = useCanvasStore((s) => s.editingId);
  const tool = useCanvasStore((s) => s.tool);
  const zoom = useCanvasStore((s) => s.camera.zoom);
  const canEdit = actions?.canEdit ?? false;
  // Одна линия: вместо рамки трансформации — ручки концов (перетаскивание = перепривязка)
  const single = selection.length === 1 ? store?.get(selection[0] ?? '') : undefined;
  const lineId =
    single && (single.type === 'line' || single.type === 'arrow') && !single.locked && canEdit
      ? single.id
      : null;

  useLayoutEffect(() => {
    const tr = trRef.current;
    const layer = elementsLayer.current;
    if (!tr || !layer) return;

    const wanted = new Set(selection);
    const nodes: Konva.Node[] = [];
    if (detail !== 'lod' && tool === 'select' && !editingId) {
      for (const node of layer.getChildren()) {
        const id = node.id();
        if (!wanted.has(id)) continue;
        if (store?.get(id)?.locked) continue;
        if (id === lineId) continue;
        nodes.push(node);
      }
    }
    tr.nodes(nodes);
    // Одиночный текст и линии — без поворота «вверх ногами» по Y-ручкам не нужен keepRatio
    const onlyImages =
      nodes.length > 0 && selection.every((id) => store?.get(id)?.type === 'image');
    tr.keepRatio(onlyImages);
    tr.getLayer()?.batchDraw();

    const box =
      selection.length > 0 && !lineId && (nodes.length < selection.length || detail === 'lod')
        ? (store?.boundsOfIds(selection) ?? null)
        : null;
    overlay?.setSelectionBox(editingId ? null : box);
  }, [selection, elements, detail, tool, editingId, store, elementsLayer, overlay, lineId]);

  // Ручки концов выделенной линии: следуют за её геометрией (коллеги, undo) и масштабом
  useEffect(() => {
    if (!overlay) return;
    if (!lineId || !store || tool !== 'select' || editingId) {
      overlay.setHandles([]);
      return;
    }
    const draw = () => {
      const line = store.get(lineId) as LineElement | undefined;
      if (!line) return overlay.setHandles([]);
      const ends = lineEnds(line);
      overlay.setHandles([
        { ...ends.start, bound: Boolean(line.startBinding) },
        { ...ends.end, bound: Boolean(line.endBinding) },
      ]);
    };
    draw();
    const unsubscribe = store.subscribe(draw);
    return () => {
      unsubscribe();
      overlay.setHandles([]);
    };
  }, [overlay, store, lineId, tool, editingId, zoom]);

  // Пересчёт рамки, когда выделенные элементы меняют коллеги или undo
  useEffect(() => {
    if (!store) return;
    return store.subscribe(() => trRef.current?.forceUpdate());
  }, [store]);

  const commit = () => {
    const tr = trRef.current;
    if (!tr || !store || !actions) return;
    const patches = new Map<string, Record<string, unknown>>();
    for (const node of tr.nodes()) {
      const el = store.get(node.id());
      if (!el) continue;
      patches.set(
        el.id,
        patchFromTransform(el, {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          scaleX: node.scaleX(),
          scaleY: node.scaleY(),
        }),
      );
      // Размер теперь в width/height — масштаб ноды возвращаем к 1
      node.scale({ x: 1, y: 1 });
    }
    const before = store.boundsOfIds(patches.keys());
    actions.update(patches);
    // Изменили размер фрейма — пересчитываем, что теперь внутри него (старая и новая область)
    const resizedFrame = Array.from(patches.keys()).some((id) => store.get(id)?.type === 'frame');
    const after = store.boundsOfIds(patches.keys());
    if (resizedFrame && before && after) actions.reparentIn(unionBounds(before, after) ?? after);
    else actions.reparent(patches.keys());
  };

  return (
    <Layer ref={transformerLayer}>
      <Transformer
        ref={trRef}
        resizeEnabled={canEdit}
        rotateEnabled={canEdit}
        rotationSnaps={ROTATION_SNAPS}
        rotationSnapTolerance={4}
        ignoreStroke
        flipEnabled={false}
        keepRatio={false}
        anchorSize={9}
        anchorCornerRadius={2}
        anchorStroke="#6366f1"
        anchorFill="#ffffff"
        borderStroke="#6366f1"
        borderStrokeWidth={1.5}
        rotateAnchorOffset={28}
        padding={2}
        boundBoxFunc={(oldBox, newBox) =>
          Math.abs(newBox.width) < 8 || Math.abs(newBox.height) < 8 ? oldBox : newBox
        }
        onTransformEnd={commit}
      />
    </Layer>
  );
}

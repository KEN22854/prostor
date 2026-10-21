'use client';

import type Konva from 'konva';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Layer, Stage } from 'react-konva';
import { toast } from 'sonner';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';
import { LOCAL_ORIGIN, type AiCapabilities, type BoardRole, type OrgPolicy } from '@prostor/shared';
import { AiProgressOverlay } from '@/components/canvas/ai-progress-overlay';
import { CanvasContextMenu } from '@/components/canvas/canvas-context-menu';
import { GenerateImageDialog } from '@/components/canvas/generate-image-dialog';
import { ElementNode } from '@/components/canvas/element-node';
import { CommentsLayer } from '@/components/comments/comments-layer';
import { VotesLayer } from '@/components/voting/votes-layer';
import { VotingBar } from '@/components/voting/voting-bar';
import { ExportDialog } from '@/components/canvas/export-dialog';
import { FollowBanner } from '@/components/canvas/follow-banner';
import { FramesPanel } from '@/components/canvas/frames-panel';
import { LodShape } from '@/components/canvas/lod-shape';
import { BoardSearch } from '@/components/canvas/board-search';
import { StickerLibrary } from '@/components/canvas/sticker-library';
import { TableCellEditor } from '@/components/canvas/table-cell-editor';
import { CropEditor } from '@/components/canvas/crop-editor';
import { EmbedPlayer } from '@/components/canvas/embed-player';
import { Minimap } from '@/components/canvas/minimap';
import { PresentationMode } from '@/components/canvas/presentation-mode';
import { SelectionLayer } from '@/components/canvas/selection-layer';
import { SelectionToolbar } from '@/components/canvas/selection-toolbar';
import { TextEditor } from '@/components/canvas/text-editor';
import { ToolPalette } from '@/components/canvas/tool-palette';
import { ZoomControls } from '@/components/canvas/zoom-controls';
import { useBoardClipboard } from '@/hooks/use-board-clipboard';
import { useBoardHotkeys } from '@/hooks/use-board-hotkeys';
import { useCameraPersistence } from '@/hooks/use-camera-persistence';
import { useCanvasInteractions } from '@/hooks/use-canvas-interactions';
import { useCanvasNavigation } from '@/hooks/use-canvas-navigation';
import { useElementStore } from '@/hooks/use-element-store';
import { useFollow } from '@/hooks/use-follow';
import { useBoardFonts } from '@/hooks/use-board-fonts';
import { useEmbedInsert } from '@/hooks/use-embed-insert';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { useImageInsert } from '@/hooks/use-image-insert';
import { usePdfImport } from '@/hooks/use-pdf-import';
import { usePresenceBroadcast } from '@/hooks/use-presence-broadcast';
import { useRemoveBg } from '@/hooks/use-remove-bg';
import { useVisibleElements } from '@/hooks/use-visible-elements';
import { BoardActions } from '@/lib/canvas/board-actions';
import { detailLevel } from '@/lib/canvas/constants';
import { CursorsRenderer } from '@/lib/canvas/cursors-renderer';
import { generateTestElements } from '@/lib/canvas/dev-generate';
import { LaserRenderer } from '@/lib/canvas/laser-renderer';
import { nextZIndex } from '@/lib/canvas/element-factory';
import type { ElementStore } from '@/lib/canvas/element-store';
import type { ControllerDeps } from '@/lib/canvas/interaction-controller';
import { OverlayRenderer } from '@/lib/canvas/overlay-renderer';
import { RemoteSelectionsRenderer } from '@/lib/canvas/remote-selections-renderer';
import { fitBounds, gridStep, visibleBounds, type Camera, type Point } from '@/lib/canvas/viewport';
import { errorMessage } from '@/lib/utils';
import { useCanvasStore, type CanvasTool } from '@/stores/canvas-store';
import { useT } from '@/lib/i18n/client';

interface BoardCanvasProps {
  boardId: string;
  /** Название доски — имя файла при экспорте */
  title: string;
  isAuthenticated: boolean;
  doc: Y.Doc | null;
  awareness: Awareness | null;
  undoManager: Y.UndoManager | null;
  role: BoardRole;
  policy: OrgPolicy;
  user: { id: string; name: string } | null;
  /** Локальная копия загружена или сервер прислал состояние — можно «показать всё» */
  contentReady: boolean;
  /** Включённые ИИ-функции (по настройкам сервера) */
  ai: AiCapabilities;
  onStoreReady?: (store: ElementStore | null) => void;
}

const TOOL_CURSOR: Partial<Record<CanvasTool, string>> = {
  sticky: 'copy',
  shape: 'crosshair',
  text: 'text',
  line: 'crosshair',
  arrow: 'crosshair',
  pen: 'crosshair',
  eraser: 'cell',
  image: 'copy',
  frame: 'crosshair',
  comment: 'cell',
  laser: 'crosshair',
  vote: 'pointer',
};

/**
 * Бесконечный холст (Konva / Canvas2D).
 *
 * Слои снизу вверх: элементы (без hit-графа) → выделения коллег → временная
 * графика (рамка, направляющие, превью) → Transformer → курсоры коллег.
 *
 * Производительность:
 *  - камера применяется к Stage императивно — панорамирование без React-рендеров;
 *  - попадания считает собственный hit-test по R-tree, а не hit-граф Konva;
 *  - React перерисовывает список нод только при смене выборки или данных;
 *  - сетка — CSS-фон контейнера; курсоры и оверлей — императивные слои.
 */
export function BoardCanvas({
  boardId,
  title,
  isAuthenticated,
  doc,
  awareness,
  undoManager,
  role,
  policy,
  user,
  contentReady,
  ai,
  onStoreReady,
}: BoardCanvasProps) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const presenting = useCanvasStore((s) => s.presentation !== null);
  const editingCell = useCanvasStore((s) => s.editingCell);
  const stageRef = useRef<Konva.Stage>(null);
  const elementsLayerRef = useRef<Konva.Layer>(null);
  const remoteLayerRef = useRef<Konva.Layer>(null);
  const overlayLayerRef = useRef<Konva.Layer>(null);
  const transformerLayerRef = useRef<Konva.Layer>(null);
  const cursorLayerRef = useRef<Konva.Layer>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImagePoint = useRef<Point | null>(null);

  const size = useCanvasStore((s) => s.size);
  const detail = useCanvasStore((s) => detailLevel(s.camera.zoom));
  const tool = useCanvasStore((s) => s.tool);
  const spacePressed = useCanvasStore((s) => s.spacePressed);
  const isPanning = useCanvasStore((s) => s.isPanning);
  const editingId = useCanvasStore((s) => s.editingId);

  const store = useElementStore(doc);
  const elements = useVisibleElements(store);
  const restored = useCameraPersistence(boardId);
  const [overlay, setOverlay] = useState<OverlayRenderer | null>(null);
  // Konva измеряет текст при создании ноды: после загрузки веб-шрифта (display: swap)
  // слой пересоздаётся, иначе переносы строк остались бы посчитаны по запасному шрифту
  const fontEpoch = useBoardFonts(store, doc);

  const actions = useMemo(
    () =>
      doc && store
        ? new BoardActions({
            doc,
            store,
            userId: user?.id ?? 'anonymous',
            role,
            policy,
            undoManager,
            anonymous: !isAuthenticated,
          })
        : null,
    [doc, store, user?.id, role, policy, undoManager, isAuthenticated],
  );

  useEffect(() => onStoreReady?.(store), [store, onStoreReady]);

  // Только dev (или сборка с NEXT_PUBLIC_CANVAS_DEBUG=1 для замеров на production-бандле):
  // доступ к камере и Stage из консоли/скриптов
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' && process.env.NEXT_PUBLIC_CANVAS_DEBUG !== '1')
      return;
    const w = window as unknown as Record<string, unknown>;
    w.__prostorCanvas = {
      canvasStore: useCanvasStore,
      getStage: () => stageRef.current,
      elementStore: store,
      actions,
      awareness,
      // Генератор нагрузки для замеров производительности (e2e perf.spec)
      generate: (count: number) => {
        if (doc) generateTestElements(doc, count, user?.id ?? 'perf', LOCAL_ORIGIN);
      },
    };
    return () => {
      delete w.__prostorCanvas;
    };
  }, [store, actions, awareness, doc, user?.id]);

  // ── Размер контейнера ──
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      useCanvasStore.getState().setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Камера → Stage и сетка (императивно) ──
  const hasStage = size.width > 0 && size.height > 0;
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!hasStage || !container) return;
    const apply = (cam: Camera) => {
      const stage = stageRef.current;
      if (stage) {
        stage.scale({ x: cam.zoom, y: cam.zoom });
        stage.position({ x: -cam.x * cam.zoom, y: -cam.y * cam.zoom });
        stage.batchDraw();
      }
      const step = gridStep(cam.zoom) * cam.zoom;
      container.style.backgroundSize = `${step}px ${step}px`;
      container.style.backgroundPosition = `${-cam.x * cam.zoom}px ${-cam.y * cam.zoom}px`;
    };
    apply(useCanvasStore.getState().camera);
    return useCanvasStore.subscribe((s, p) => {
      if (s.camera !== p.camera) apply(s.camera);
    });
  }, [hasStage]);

  // ── Оверлей и выделения коллег ──
  useEffect(() => {
    const layer = overlayLayerRef.current;
    if (!hasStage || !layer) return;
    const renderer = new OverlayRenderer(layer, () => useCanvasStore.getState().camera.zoom);
    setOverlay(renderer);
    return () => {
      renderer.destroy();
      setOverlay(null);
    };
  }, [hasStage]);

  useEffect(() => {
    const layer = remoteLayerRef.current;
    if (!hasStage || !layer || !awareness || !store) return;
    const renderer = new RemoteSelectionsRenderer(
      layer,
      awareness,
      store,
      () => useCanvasStore.getState().camera.zoom,
    );
    let lastZoom = useCanvasStore.getState().camera.zoom;
    const unsubscribe = useCanvasStore.subscribe((s) => {
      // Толщина рамок зависит от масштаба — обновляем при заметной смене zoom
      if (Math.abs(s.camera.zoom / lastZoom - 1) > 0.15) {
        lastZoom = s.camera.zoom;
        renderer.refresh();
      }
    });
    return () => {
      unsubscribe();
      renderer.destroy();
    };
  }, [hasStage, awareness, store]);

  // ── Лазерная указка (свой след и следы коллег) ──
  const laserRef = useRef<LaserRenderer | null>(null);
  useEffect(() => {
    const layer = cursorLayerRef.current;
    if (!hasStage || !layer) return;
    const renderer = new LaserRenderer(
      layer,
      awareness,
      () => useCanvasStore.getState().camera.zoom,
      '#ef4444',
    );
    laserRef.current = renderer;
    return () => {
      renderer.destroy();
      laserRef.current = null;
    };
  }, [awareness, hasStage]);

  // ── Курсоры коллег ──
  useEffect(() => {
    const layer = cursorLayerRef.current;
    if (!hasStage || !layer || !awareness) return;
    const renderer = new CursorsRenderer(layer, awareness, () => useCanvasStore.getState().camera);
    return () => renderer.destroy();
  }, [awareness, hasStage]);

  // ── «Показать всё» ──
  const fit = useCallback(() => {
    const { size: current, setCamera } = useCanvasStore.getState();
    if (current.width === 0) return;
    const extent = store?.extent();
    if (!extent) {
      // Пустая доска: начало координат в центре экрана
      setCamera({ x: -current.width / 2, y: -current.height / 2, zoom: 1 });
      return;
    }
    setCamera(fitBounds(extent, current, 80, 1));
  }, [store]);

  useCanvasNavigation(containerRef, fit);
  usePresenceBroadcast(containerRef, awareness);
  useFollow(awareness, user?.id);

  // Первое открытие доски в этом браузере: показываем всё содержимое
  const initialFitDone = useRef(false);
  useEffect(() => {
    if (initialFitDone.current || restored !== false || !hasStage || !store || !contentReady)
      return;
    initialFitDone.current = true;
    fit();
  }, [restored, hasStage, store, contentReady, fit]);

  // ── Изображения ──
  const insertImages = useImageInsert({ boardId, doc, actions, userId: user?.id ?? null });
  const insertEmbed = useEmbedInsert({ boardId, doc, actions, userId: user?.id ?? null });
  const [linkDialog, askLink] = usePrompt();
  const addLink = async () => {
    const url = await askLink({
      title: 'Добавить ссылку',
      description:
        'YouTube, Vimeo, Loom, Figma, Google Docs, Miro — со встроенным просмотром; любой сайт — карточкой',
      label: 'https://…',
      confirmLabel: 'Добавить',
      maxLength: 2048,
    });
    if (!url) return;
    const { camera, size: s } = useCanvasStore.getState();
    const v = visibleBounds(camera, s);
    await insertEmbed(url, { x: (v.minX + v.maxX) / 2, y: (v.minY + v.maxY) / 2 });
  };
  const removeBg = useRemoveBg({ boardId, doc, store, actions, userId: user?.id ?? null });
  const importPdf = usePdfImport({ boardId, doc, actions, userId: user?.id ?? null });
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const openImagePicker = useCallback((at?: Point) => {
    const { camera, size: s } = useCanvasStore.getState();
    const v = visibleBounds(camera, s);
    pendingImagePoint.current = at ?? { x: (v.minX + v.maxX) / 2, y: (v.minY + v.maxY) / 2 };
    fileInputRef.current?.click();
  }, []);

  // ── Взаимодействия ──
  const userRef = useRef(user);
  userRef.current = user;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const controllerDeps = useMemo<ControllerDeps | null>(() => {
    if (!store || !overlay || !doc) return null;
    return {
      store,
      overlay,
      actions: () => actionsRef.current,
      user: () => userRef.current,
      nodesOf: (ids) => {
        const wanted = new Set(ids);
        return (elementsLayerRef.current?.getChildren() ?? []).filter((n) => wanted.has(n.id()));
      },
      hitsTransformer: (screen) => {
        const layer = transformerLayerRef.current;
        if (!layer) return false;
        // Hit-граф Konva рисует в rAF; если ручки только что появились (клик → сразу
        // захват ручки), он может быть ещё пуст — дорисовываем (слой крошечный)
        layer.drawHit();
        return Boolean(layer.getIntersection(screen));
      },
      openImagePicker: (at) => openImagePicker(at),
      nextZIndex: () => nextZIndex(doc),
      laser: () => laserRef.current,
      onError: (e) => toast.error(errorMessage(e, t('Не удалось выполнить действие'))),
    };
  }, [store, overlay, doc, openImagePicker, t]);

  useCanvasInteractions(containerRef, controllerDeps);
  useBoardHotkeys({ actions, store, undoManager, openImagePicker: () => openImagePicker() });
  useBoardClipboard({
    containerRef,
    actions,
    doc,
    userId: user?.id ?? null,
    insertImages,
    importPdf,
    insertEmbed,
  });

  const cursor = isPanning
    ? 'grabbing'
    : tool === 'hand' || spacePressed
      ? 'grab'
      : (TOOL_CURSOR[tool] ?? 'default');

  return (
    <div
      ref={containerRef}
      className="canvas-surface relative h-full w-full overflow-hidden bg-canvas"
      style={{
        cursor,
        backgroundImage:
          'radial-gradient(circle, hsl(var(--canvas-grid)) 1.1px, transparent 1.3px)',
      }}
      data-testid="board-canvas"
      data-visible-count={elements.length}
      data-detail={detail}
    >
      {hasStage ? (
        <Stage ref={stageRef} width={size.width} height={size.height}>
          {/* Элементы без hit-графа: попадания считает собственный hit-test (lib/canvas/hit-test) */}
          <Layer key={fontEpoch} ref={elementsLayerRef} listening={false}>
            {detail === 'lod' ? (
              <LodShape elements={elements} />
            ) : (
              elements.map((el) => (
                <ElementNode
                  key={el.id}
                  element={el}
                  detail={detail}
                  editing={el.id === editingId}
                  editingCell={editingCell?.id === el.id ? editingCell : null}
                />
              ))
            )}
          </Layer>
          <Layer ref={remoteLayerRef} listening={false} />
          <Layer ref={overlayLayerRef} listening={false} />
          <SelectionLayer
            elementsLayer={elementsLayerRef}
            transformerLayer={transformerLayerRef}
            store={store}
            actions={actions}
            overlay={overlay}
            elements={elements}
            detail={detail}
          />
          <Layer ref={cursorLayerRef} listening={false} />
        </Stage>
      ) : null}

      {store && actions ? (
        <TextEditor
          store={store}
          actions={actions}
          awareness={awareness}
          undoManager={undoManager}
        />
      ) : null}
      {store && actions?.canEdit && !presenting ? (
        <TableCellEditor store={store} actions={actions} />
      ) : null}
      {store && !presenting ? <EmbedPlayer store={store} /> : null}
      {store && actions?.canEdit && !presenting ? (
        <CropEditor store={store} actions={actions} />
      ) : null}
      {actions?.canEdit && !presenting ? (
        <ToolPalette
          onPickImage={() => openImagePicker()}
          onGenerateImage={ai.generateImage ? () => setGenerateOpen(true) : undefined}
          onImportPdf={() => pdfInputRef.current?.click()}
          onAddLink={() => void addLink()}
          stickers={
            user ? (
              <StickerLibrary boardId={boardId} doc={doc} actions={actions} userId={user.id} />
            ) : null
          }
        />
      ) : null}
      {store && actions && !presenting ? (
        <SelectionToolbar
          store={store}
          boardId={boardId}
          doc={doc}
          actions={actions}
          onRemoveBg={ai.removeBg ? (id) => void removeBg(id) : undefined}
        />
      ) : null}
      <AiProgressOverlay store={store} />
      <CanvasContextMenu
        containerRef={containerRef}
        store={store}
        actions={actions}
        ai={ai}
        onRemoveBg={(id) => void removeBg(id)}
        onFit={fit}
      />
      {ai.generateImage && actions?.canEdit ? (
        <GenerateImageDialog
          open={generateOpen}
          onOpenChange={setGenerateOpen}
          boardId={boardId}
          doc={doc}
          actions={actions}
          userId={user?.id ?? null}
        />
      ) : null}
      <CommentsLayer boardId={boardId} store={store} canComment={Boolean(actions?.canComment)} />
      <VotesLayer store={store} />
      <VotingBar store={store} />
      {presenting ? null : <FramesPanel store={store} actions={actions} />}
      {presenting ? null : <BoardSearch store={store} />}
      <FollowBanner />
      {store && actions ? (
        <ExportDialog boardId={boardId} boardTitle={title} store={store} actions={actions} />
      ) : null}
      {presenting ? null : (
        <>
          <ZoomControls
            onFit={fit}
            showNavTools={!actions?.canEdit}
            showCommentTool={!actions?.canEdit && Boolean(actions?.canComment)}
          />
          <Minimap store={store} />
        </>
      )}
      <PresentationMode
        store={store}
        actions={actions}
        awareness={awareness}
        containerRef={containerRef}
      />

      {linkDialog}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        multiple
        hidden
        data-testid="image-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length === 0) return;
          // Точку задаёт инструмент «Изображение»; иначе — центр экрана
          const { camera, size: s } = useCanvasStore.getState();
          const v = visibleBounds(camera, s);
          const at = pendingImagePoint.current ?? {
            x: (v.minX + v.maxX) / 2,
            y: (v.minY + v.maxY) / 2,
          };
          pendingImagePoint.current = null;
          void insertImages(files, at);
        }}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        data-testid="pdf-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const { camera, size: s } = useCanvasStore.getState();
          const v = visibleBounds(camera, s);
          void importPdf(file, { x: v.minX + 40 / camera.zoom, y: v.minY + 60 / camera.zoom });
        }}
      />
    </div>
  );
}

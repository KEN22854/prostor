'use client';

import { Bold, Italic, List, Strikethrough, Underline, type LucideIcon } from 'lucide-react';
import { baseKeymap, chainCommands, splitBlockAs, toggleMark } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { EditorState, Selection, type Command } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import { redo, undo, yCursorPlugin, ySyncPlugin, ySyncPluginKey, yUndoPlugin } from 'y-prosemirror';
import type * as Y from 'yjs';
import {
  richToPlain,
  type BoardElement,
  type ShapeElement,
  type StickyElement,
  type TextElement,
} from '@prostor/shared';
import type { BoardActions } from '@/lib/canvas/board-actions';
import type { ElementStore } from '@/lib/canvas/element-store';
import { canvasFont } from '@/lib/canvas/fonts';
import { worldToScreen } from '@/lib/canvas/viewport';
import { richSchema, type RichMark } from '@/lib/rich-text/schema';
import { textCursorAwareness } from '@/lib/rich-text/cursor-awareness';
import { fragmentToRich } from '@/lib/rich-text/yjs-convert';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';
import { useT } from '@/lib/i18n/client';

type Editable = StickyElement | TextElement | ShapeElement;
const isEditable = (el: BoardElement | undefined): el is Editable =>
  el?.type === 'sticky' || el?.type === 'text' || el?.type === 'shape';

/** Отступы текста должны совпадать с отрисовкой в Konva (sticky-shape, basic-shape) */
const PADDING: Record<Editable['type'], number> = { sticky: 14, shape: 8, text: 0 };
const MAX_TEXT = 10_000;
/** Поле awareness для курсоров в тексте — «cursor» занят указателем на холсте */
const TEXT_CURSOR_FIELD = 'textCursor';

interface TextEditorProps {
  store: ElementStore;
  actions: BoardActions;
  awareness: Awareness | null;
  undoManager: Y.UndoManager | null;
}

/**
 * Inline-редактор форматированного текста стикера / фигуры / текстового блока.
 *
 * ProseMirror поверх холста, связанный с Y.XmlFragment элемента через
 * y-prosemirror: несколько человек правят один стикер посимвольно, видят
 * курсоры друг друга, а CRDT сливает правки без потерь. Блок позиционируется
 * по экранным координатам элемента, повёрнут и масштабирован вместе с ним;
 * текст в Konva на это время скрыт.
 */
export function TextEditor({ store, actions, awareness, undoManager }: TextEditorProps) {
  const editingId = useCanvasStore((s) => s.editingId);
  const camera = useCanvasStore((s) => s.camera);
  const setEditing = useCanvasStore((s) => s.setEditing);
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  const element = editingId ? store.get(editingId) : undefined;

  if (!editingId || !isEditable(element)) return null;
  return (
    <EditorBox
      key={editingId}
      element={element}
      camera={camera}
      actions={actions}
      awareness={awareness}
      undoManager={undoManager}
      onDone={() => setEditing(null)}
    />
  );
}

/** Пункт списка: включить/выключить для всех абзацев выделения */
const toggleBullet: Command = (state, dispatch) => {
  const { from, to } = state.selection;
  let allBullets = true;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.type.name === 'paragraph' && !node.attrs.bullet) allBullets = false;
  });
  if (dispatch) {
    const tr = state.tr;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name === 'paragraph')
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, bullet: !allBullets });
    });
    dispatch(tr);
  }
  return true;
};

/**
 * Ctrl+Home / Ctrl+End явно: штатная команда браузера внутри холста
 * (absolute-позиционированный редактор с transform) каретку не двигает.
 */
const caretTo =
  (where: 'start' | 'end'): Command =>
  (state, dispatch) => {
    dispatch?.(
      state.tr
        .setSelection(where === 'start' ? Selection.atStart(state.doc) : Selection.atEnd(state.doc))
        .scrollIntoView(),
    );
    return true;
  };

/** Enter в пустом пункте списка выходит из списка, в непустом — новый пункт */
const exitEmptyBullet: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const node = $from.parent;
  if (!empty || node.type.name !== 'paragraph' || !node.attrs.bullet || node.content.size > 0)
    return false;
  dispatch?.(state.tr.setNodeMarkup($from.before(), undefined, { ...node.attrs, bullet: false }));
  return true;
};
const splitKeepingBullet = splitBlockAs((node) =>
  node.type.name === 'paragraph'
    ? { type: richSchema.nodes.paragraph!, attrs: { bullet: node.attrs.bullet } }
    : null,
);

const MARK_BUTTONS: Array<{ mark: RichMark; icon: LucideIcon; label: string; hotkey: string }> = [
  { mark: 'bold', icon: Bold, label: 'Жирный', hotkey: 'Ctrl+B' },
  { mark: 'italic', icon: Italic, label: 'Курсив', hotkey: 'Ctrl+I' },
  { mark: 'underline', icon: Underline, label: 'Подчёркнутый', hotkey: 'Ctrl+U' },
  { mark: 'strike', icon: Strikethrough, label: 'Зачёркнутый', hotkey: 'Ctrl+Shift+X' },
];

interface EditorBoxProps {
  element: Editable;
  camera: { x: number; y: number; zoom: number };
  actions: BoardActions;
  awareness: Awareness | null;
  undoManager: Y.UndoManager | null;
  onDone: () => void;
}

function EditorBox({
  element: el,
  camera,
  actions,
  awareness,
  undoManager,
  onDone,
}: EditorBoxProps) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const fragmentRef = useRef<Y.XmlFragment | null>(null);
  const finished = useRef(false);
  const heightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Пересоздание редактора, если коллега подменил фрагмент (одновременное первое открытие)
  const [generation, setGeneration] = useState(0);
  // Активные метки под курсором — подсветка кнопок панели
  const [active, setActive] = useState<Set<string>>(new Set());

  /** Высота текстового блока подстраивается под содержимое */
  const contentHeight = (): number | null => {
    const host = hostRef.current;
    if (!host || el.type !== 'text') return null;
    return Math.max(Math.ceil(el.fontSize * 1.3), Math.ceil(host.scrollHeight / camera.zoom));
  };

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    if (heightTimer.current) clearTimeout(heightTimer.current);
    const fragment = fragmentRef.current;
    const text = fragment ? richToPlain(fragmentToRich(fragment)).slice(0, MAX_TEXT) : el.text;
    if (el.type === 'text' && text.trim() === '') {
      // Пустой текстовый блок не оставляем на доске
      actions.delete([el.id]);
    } else {
      // Плоская копия — для поиска, LOD и экспорта без раскладки
      const h = contentHeight();
      actions.update(new Map([[el.id, { text, ...(h ? { height: h } : {}) }]]), true);
    }
    onDone();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    const host = hostRef.current;
    const fragment = actions.ensureRichContent(el.id);
    if (!host || !fragment) {
      onDone();
      return;
    }
    fragmentRef.current = fragment;
    // Правки текста попадают в общий стек отмены доски (Ctrl+Z после закрытия редактора)
    undoManager?.addTrackedOrigin(ySyncPluginKey);
    actions.beginGesture();

    const done = () => {
      viewRef.current?.dom.blur();
      return true;
    };
    const state = EditorState.create({
      schema: richSchema,
      plugins: [
        ySyncPlugin(fragment),
        ...(awareness
          ? [
              yCursorPlugin(
                textCursorAwareness(awareness, TEXT_CURSOR_FIELD),
                {},
                TEXT_CURSOR_FIELD,
              ),
            ]
          : []),
        yUndoPlugin(),
        keymap({
          'Mod-z': undo,
          'Mod-y': redo,
          'Mod-Shift-z': redo,
          'Mod-b': toggleMark(richSchema.marks.bold!),
          'Mod-i': toggleMark(richSchema.marks.italic!),
          'Mod-u': toggleMark(richSchema.marks.underline!),
          'Mod-Shift-x': toggleMark(richSchema.marks.strike!),
          'Mod-Shift-8': toggleBullet,
          'Mod-Home': caretTo('start'),
          'Mod-End': caretTo('end'),
          Enter: chainCommands(exitEmptyBullet, splitKeepingBullet),
          Escape: done,
          'Mod-Enter': done,
        }),
        keymap(baseKeymap),
      ],
    });
    const view = new EditorView(host, {
      state,
      attributes: {
        'aria-label': 'Текст объекта',
        role: 'textbox',
        'aria-multiline': 'true',
        spellcheck: 'true',
      },
      // «- » или «* » в начале абзаца — пункт списка, как в мессенджерах и Markdown
      handleTextInput(v, from, _to, text) {
        if (text !== ' ') return false;
        const $from = v.state.doc.resolve(from);
        const para = $from.parent;
        const before = para.textBetween(0, $from.parentOffset);
        if (para.type.name !== 'paragraph' || para.attrs.bullet || !/^[-*•]$/.test(before))
          return false;
        const start = $from.start();
        v.dispatch(
          v.state.tr
            .delete(start, start + before.length)
            .setNodeMarkup($from.before(), undefined, { ...para.attrs, bullet: true }),
        );
        return true;
      },
      // this, а не замыкание на view: ySyncPlugin диспатчит ещё из конструктора EditorView
      dispatchTransaction(this: EditorView, tr) {
        // y-prosemirror шлёт отложенные метаданные по таймеру — view к тому моменту
        // может быть уже уничтожен (закрыли редактор; двойной mount эффектов в dev)
        if (this.isDestroyed) return;
        const next = this.state.apply(tr);
        this.updateState(next);
        const marks = new Set(
          (next.storedMarks ?? next.selection.$from.marks()).map((m) => m.type.name),
        );
        setActive(marks);
        if (tr.docChanged && el.type === 'text') {
          if (heightTimer.current) clearTimeout(heightTimer.current);
          heightTimer.current = setTimeout(() => {
            const h = contentHeight();
            if (h && Math.abs(h - el.height) > 1)
              actions.update(new Map([[el.id, { height: h }]]), true);
          }, 250);
        }
      },
      handleDOMEvents: {
        blur: (_v, event) => {
          // Клик по кнопке панели форматирования не закрывает редактор
          const related = (event as FocusEvent).relatedTarget;
          if (related instanceof Node && host.parentElement?.contains(related)) return false;
          finishRef.current();
          return false;
        },
      },
    });
    viewRef.current = view;
    // ySyncPlugin заполняет документ синхронно в конструкторе — курсор в конец сразу,
    // до фокуса: отложенная установка перезаписала бы позицию, если пользователь
    // уже успел нажать Home или кликнуть в тексте
    view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)));
    view.focus();

    // Фрагмент заменили (коллега одновременно открыл тот же старый стикер) — переподключаемся
    const map = actions.elementMap(el.id);
    const onMapChange = (event: Y.YMapEvent<unknown>) => {
      if (event.keysChanged.has('content') && map?.get('content') !== fragment)
        setGeneration((g) => g + 1);
    };
    map?.observe(onMapChange);

    return () => {
      map?.unobserve(onMapChange);
      if (heightTimer.current) clearTimeout(heightTimer.current);
      awareness?.setLocalStateField(TEXT_CURSOR_FIELD, null);
      view.destroy();
      viewRef.current = null;
    };
    // Редактор создаётся при открытии (и при подмене фрагмента); размеры/камера — через стили
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation]);

  const run = (command: Command) => {
    const view = viewRef.current;
    if (!view) return;
    command(view.state, view.dispatch);
    view.focus();
  };

  const pos = worldToScreen(camera, { x: el.x, y: el.y });
  const pad = PADDING[el.type] * camera.zoom;
  const vertical =
    el.verticalAlign === 'middle'
      ? 'center'
      : el.verticalAlign === 'bottom'
        ? 'flex-end'
        : 'flex-start';

  const box: CSSProperties = {
    position: 'absolute',
    left: pos.x,
    top: pos.y,
    width: el.width * camera.zoom,
    minHeight: el.type === 'text' ? undefined : el.height * camera.zoom,
    padding: pad,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    transformOrigin: '0 0',
    display: 'flex',
    alignItems: vertical,
    zIndex: 20,
  };
  const content: CSSProperties = {
    width: '100%',
    fontFamily: canvasFont(el.fontFamily),
    fontSize: el.fontSize * camera.zoom,
    lineHeight: 1,
    fontWeight: el.fontWeight === 'bold' ? 700 : 400,
    fontStyle: el.fontStyle,
    color: el.textColor,
    textAlign: el.type === 'shape' ? 'center' : el.align,
    caretColor: el.textColor,
  };

  return (
    <div style={box} data-testid="text-editor" onPointerDown={(e) => e.stopPropagation()}>
      <div
        className="absolute -top-11 left-0 flex items-center gap-0.5 rounded-lg border bg-background/95 p-0.5 shadow-md backdrop-blur"
        role="toolbar"
        aria-label={t('Форматирование текста')}
        // Кнопки не забирают фокус у редактора
        onMouseDown={(e) => e.preventDefault()}
      >
        {MARK_BUTTONS.map(({ mark, icon: Icon, label, hotkey }) => (
          <button
            key={mark}
            type="button"
            title={`${label} (${hotkey})`}
            aria-label={label}
            aria-pressed={active.has(mark)}
            className={cn(
              'rounded p-1.5 text-foreground hover:bg-muted',
              active.has(mark) && 'bg-accent text-accent-foreground',
            )}
            onClick={() => run(toggleMark(richSchema.marks[mark]!))}
          >
            <Icon className="size-3.5" />
          </button>
        ))}
        <button
          type="button"
          title={t('Список (Ctrl+Shift+8, или «- » в начале строки)')}
          aria-label={t('Список')}
          className="rounded p-1.5 text-foreground hover:bg-muted"
          onClick={() => run(toggleBullet)}
        >
          <List className="size-3.5" />
        </button>
      </div>
      <div
        ref={hostRef}
        className="rich-text-editor"
        style={content}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

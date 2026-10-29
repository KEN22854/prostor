'use client';

import {
  Baseline,
  Bold,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Strikethrough,
  Underline,
  X,
  type LucideIcon,
} from 'lucide-react';
import { TEXT_COLORS } from '@/components/canvas/text-style-controls';
import { baseKeymap, chainCommands, toggleMark } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { EditorState, Selection, type Command } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
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
import {
  exitEmptyListItem,
  listKindOf,
  markdownShortcut,
  setColorMark,
  splitKeepingList,
  toggleCheckedAt,
  toggleHeading,
  toggleList,
  type ListKind,
} from '@/lib/rich-text/commands';
import { richSchema, type RichMark, type RichValueMark } from '@/lib/rich-text/schema';
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

const MARK_BUTTONS: Array<{ mark: RichMark; icon: LucideIcon; label: string; hotkey: string }> = [
  { mark: 'bold', icon: Bold, label: 'Жирный', hotkey: 'Ctrl+B' },
  { mark: 'italic', icon: Italic, label: 'Курсив', hotkey: 'Ctrl+I' },
  { mark: 'underline', icon: Underline, label: 'Подчёркнутый', hotkey: 'Ctrl+U' },
  { mark: 'strike', icon: Strikethrough, label: 'Зачёркнутый', hotkey: 'Ctrl+Shift+X' },
];

type BlockState = { list: ListKind | null; heading: number };

const BLOCK_BUTTONS: Array<{
  key: string;
  icon: LucideIcon;
  label: string;
  hotkey: string;
  command: Command;
  isActive: (b: BlockState) => boolean;
}> = [
  {
    key: 'h1',
    icon: Heading1,
    label: 'Заголовок',
    hotkey: '# пробел',
    command: toggleHeading(1),
    isActive: (b) => b.heading === 1,
  },
  {
    key: 'h2',
    icon: Heading2,
    label: 'Подзаголовок',
    hotkey: '## пробел',
    command: toggleHeading(2),
    isActive: (b) => b.heading === 2,
  },
  {
    key: 'bullet',
    icon: List,
    label: 'Маркированный список',
    hotkey: '- пробел',
    command: toggleList('bullet'),
    isActive: (b) => b.list === 'bullet',
  },
  {
    key: 'number',
    icon: ListOrdered,
    label: 'Нумерованный список',
    hotkey: '1. пробел',
    command: toggleList('number'),
    isActive: (b) => b.list === 'number',
  },
  {
    key: 'check',
    icon: ListChecks,
    label: 'Чек-лист',
    hotkey: '[] пробел',
    command: toggleList('check'),
    isActive: (b) => b.list === 'check',
  },
];

/** Цвета маркера — мягкие, чтобы текст оставался читаемым */
const HIGHLIGHT_COLORS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa'];

function FormatButton({
  label,
  hotkey,
  active,
  onClick,
  children,
}: {
  label: string;
  hotkey?: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={hotkey ? `${label} (${hotkey})` : label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'rounded-lg p-1.5 text-foreground transition-colors hover:bg-muted',
        active && 'bg-accent text-primary',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />;

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
  // Вид абзаца под курсором (список, заголовок) — подсветка кнопок
  const [block, setBlock] = useState<{ list: ListKind | null; heading: number }>({
    list: null,
    heading: 0,
  });
  // Открытая палитра цвета текста или маркера
  const [palette, setPalette] = useState<RichValueMark | null>(null);

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
          'Mod-Shift-8': toggleList('bullet'),
          'Mod-Shift-7': toggleList('number'),
          'Mod-Shift-9': toggleList('check'),
          'Mod-Alt-1': toggleHeading(1),
          'Mod-Alt-2': toggleHeading(2),
          'Mod-Home': caretTo('start'),
          'Mod-End': caretTo('end'),
          Enter: chainCommands(exitEmptyListItem, splitKeepingList),
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
      // «- », «1. », «[] », «# » в начале абзаца — список, чек-лист, заголовок (как в Markdown)
      handleTextInput(v, from, _to, text) {
        if (text !== ' ') return false;
        const tr = markdownShortcut(v.state, from);
        if (!tr) return false;
        v.dispatch(tr);
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
        const para = next.selection.$from.parent;
        setBlock({ list: listKindOf(para), heading: Number(para.attrs.heading) || 0 });
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
        // Клик по квадратику чек-листа (слева от текста пункта) — отметить пункт
        mousedown: (v, event) => {
          const target = (event.target as HTMLElement).closest?.('p[data-list="check"]');
          if (!(target instanceof HTMLElement)) return false;
          const left = target.getBoundingClientRect().left;
          const indent = parseFloat(getComputedStyle(target).paddingLeft) || 0;
          if ((event as MouseEvent).clientX - left > indent) return false;
          const tr = toggleCheckedAt(v.state, v.posAtDOM(target, 0) - 1);
          if (!tr) return false;
          event.preventDefault();
          v.dispatch(tr);
          return true;
        },
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
    // Базовый размер — для отступов списков (у заголовков свой font-size)
    ['--base' as string]: `${el.fontSize * camera.zoom}px`,
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
        className="floating-panel absolute -top-11 left-0 flex items-center gap-0.5 p-0.5 duration-300 animate-in fade-in-0 zoom-in-95"
        role="toolbar"
        aria-label={t('Форматирование текста')}
        // Кнопки не забирают фокус у редактора
        onMouseDown={(e) => e.preventDefault()}
      >
        {MARK_BUTTONS.map(({ mark, icon: Icon, label, hotkey }) => (
          <FormatButton
            key={mark}
            label={t(label)}
            hotkey={hotkey}
            active={active.has(mark)}
            onClick={() => run(toggleMark(richSchema.marks[mark]!))}
          >
            <Icon className="size-3.5" />
          </FormatButton>
        ))}
        <Sep />
        {BLOCK_BUTTONS.map(({ key, icon: Icon, label, hotkey, command, isActive }) => (
          <FormatButton
            key={key}
            label={t(label)}
            hotkey={hotkey}
            active={isActive(block)}
            onClick={() => run(command)}
          >
            <Icon className="size-3.5" />
          </FormatButton>
        ))}
        <Sep />
        <FormatButton
          label={t('Цвет текста')}
          active={palette === 'color' || active.has('color')}
          onClick={() => setPalette(palette === 'color' ? null : 'color')}
        >
          <Baseline className="size-3.5" />
        </FormatButton>
        <FormatButton
          label={t('Маркер')}
          active={palette === 'highlight' || active.has('highlight')}
          onClick={() => setPalette(palette === 'highlight' ? null : 'highlight')}
        >
          <Highlighter className="size-3.5" />
        </FormatButton>
        {palette ? (
          <div className="floating-panel absolute left-0 top-full mt-1 flex items-center gap-1 p-1.5 animate-in fade-in-0 slide-in-from-top-1">
            {(palette === 'color' ? TEXT_COLORS : HIGHLIGHT_COLORS).map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                className="size-5 rounded-full border border-black/10 transition-transform hover:scale-110"
                style={{ background: c }}
                onClick={() => {
                  run(setColorMark(palette, c));
                  setPalette(null);
                }}
              />
            ))}
            <button
              type="button"
              title={t('Убрать')}
              aria-label={t('Убрать')}
              className="flex size-5 items-center justify-center rounded-full border text-muted-foreground hover:bg-muted"
              onClick={() => {
                run(setColorMark(palette, null));
                setPalette(null);
              }}
            >
              <X className="size-3" />
            </button>
          </div>
        ) : null}
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

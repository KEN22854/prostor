/**
 * Структура Yjs-документа доски — единый контракт для web, ws-server и worker.
 *
 *   doc
 *   ├── "elements" : Y.Map<Y.Map<unknown>>  — id → элемент (поля BoardElement)
 *   ├── "meta"     : Y.Map<unknown>         — title, schemaVersion, layers, timer...
 *   ├── "frames"   : Y.Map<Y.Map<unknown>>  — порядок фреймов для презентации
 *   └── "comments" : Y.Array<CommentPin>    — пины тредов (тела комментариев — в Postgres)
 *
 * Yjs не импортируется здесь, чтобы shared оставался без тяжёлых зависимостей;
 * доступ к корневым типам — через эти ключи.
 */
export const Y_KEYS = {
  elements: 'elements',
  meta: 'meta',
  frames: 'frames',
  comments: 'comments',
} as const;

/** Версия схемы документа. При изменении — миграция в worker при загрузке. */
export const YDOC_SCHEMA_VERSION = 1;

/**
 * Origin для локальных транзакций. Y.UndoManager отслеживает только его
 * (trackedOrigins = new Set([LOCAL_ORIGIN])), поэтому удалённые апдейты
 * и апдейты из IndexedDB не попадают в undo-стек пользователя.
 */
export const LOCAL_ORIGIN = 'local';

/** Origin для изменений, применённых сервером (восстановление версии, ИИ) */
export const SERVER_ORIGIN = 'server';

export interface CommentPin {
  threadId: string;
  elementId?: string;
  x?: number;
  y?: number;
  resolved: boolean;
}

/** Имя комнаты y-websocket для доски */
export function boardRoomName(boardId: string): string {
  return `board:${boardId}`;
}

export function parseBoardRoomName(room: string): string | null {
  const match = /^board:([a-z0-9]{8,64})$/i.exec(room);
  return match?.[1] ?? null;
}

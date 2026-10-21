/** Общие лимиты и константы, используемые и клиентом, и серверами. */

export const LIMITS = {
  /** Макс. объектов на доске (защита от «бомб» через импорт) */
  maxElementsPerBoard: 50_000,
  /**
   * Макс. размер одного WS-сообщения (Yjs-апдейта) от клиента, байт.
   * Должен вмещать ПОЛНОЕ состояние доски: клиент, долго работавший офлайн,
   * или большая вставка/импорт отправляют всё одним sync step2/update.
   * Замер: 10 000 стикеров ≈ 5,8 МБ, значит лимит доски 50 000 ≈ 30 МБ. Если лимит
   * меньше, сервер рвёт соединение, клиент переподключается и шлёт то же самое —
   * синхронизация такого клиента блокируется навсегда.
   */
  maxYjsUpdateBytes: 64 * 1024 * 1024,
  /** Макс. размер загружаемого файла, байт */
  maxUploadBytes: 50 * 1024 * 1024,
  maxBoardTitle: 120,
  maxCommentLength: 5_000,
} as const;

export const SNAPSHOT = {
  /** Debounce периодического снапшота, мс */
  debounceMs: 30_000,
  /** Даже при непрерывном редактировании снапшот не реже, чем раз в N мс */
  maxWaitMs: 5 * 60_000,
  /** Сколько AUTO-снапшотов хранить на доску (старые прореживаются) */
  keepAuto: 200,
} as const;

export const CANVAS = {
  minZoom: 0.02,
  maxZoom: 8,
  gridSize: 20,
  /** Буфер виртуализации — доля размера viewport с каждой стороны */
  viewportBuffer: 1,
} as const;

export const ALLOWED_IMAGE_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
] as const;

/** Имена очередей BullMQ (web ставит задачи, worker их выполняет) */
export const QUEUES = {
  ai: 'prostor-ai',
  export: 'prostor-export',
  email: 'prostor-email',
  thumbnails: 'prostor-thumbnails',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

import { z } from 'zod';
import { LIMITS } from './constants';
import type { BoardRole, OrgPolicy } from './permissions';

/** Встроенные шаблоны. Содержимое шаблонов наполняется в итерации 7. */
export const BOARD_TEMPLATES = [
  { key: 'blank', name: 'Пустая доска', description: 'Чистый холст' },
  { key: 'mindmap', name: 'Интеллект-карта', description: 'Идеи вокруг центральной темы' },
  { key: 'kanban', name: 'Канбан', description: 'Задачи по статусам' },
  { key: 'retro', name: 'Ретроспектива', description: 'Что было хорошо, что улучшить' },
  { key: 'flowchart', name: 'Блок-схема', description: 'Процессы и решения' },
  { key: 'bpmn', name: 'BPMN', description: 'Бизнес-процессы в нотации BPMN' },
  { key: 'swot', name: 'SWOT-анализ', description: 'Сильные и слабые стороны' },
  { key: 'story-map', name: 'User story map', description: 'Путь пользователя и релизы' },
] as const;

export type BoardTemplateKey = (typeof BOARD_TEMPLATES)[number]['key'];
const templateKeys = BOARD_TEMPLATES.map((t) => t.key) as [BoardTemplateKey, ...BoardTemplateKey[]];

const titleSchema = z
  .string()
  .trim()
  .min(1, 'Введите название')
  .max(LIMITS.maxBoardTitle, `Не длиннее ${LIMITS.maxBoardTitle} символов`);

export const createBoardSchema = z.object({
  title: titleSchema.default('Без названия'),
  templateKey: z.enum(templateKeys).default('blank'),
  folderId: z.string().max(64).optional(),
  /** Доска организации (без папки) */
  orgId: z.string().max(64).optional(),
});
export type CreateBoardInput = z.input<typeof createBoardSchema>;

export const updateBoardSchema = z
  .object({
    title: titleSchema.optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Нечего обновлять');
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;

export const BOARD_SORTS = ['recent', 'name', 'created'] as const;
export const BOARD_FILTERS = ['all', 'mine', 'shared', 'favorites'] as const;

export const listBoardsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  sort: z.enum(BOARD_SORTS).default('recent'),
  filter: z.enum(BOARD_FILTERS).default('all'),
  /** Рабочее пространство: доски организации */
  org: z.string().max(64).optional(),
  /** Доски папки (без вложенных) */
  folder: z.string().max(64).optional(),
});
export type ListBoardsQuery = z.infer<typeof listBoardsQuerySchema>;

/** DTO карточки доски на дашборде */
export interface BoardListItem {
  id: string;
  title: string;
  templateKey: string | null;
  thumbnailUrl: string | null;
  objectCount: number;
  lastActivityAt: string;
  createdAt: string;
  owner: { id: string; name: string | null };
  isOwner: boolean;
  isFavorite: boolean;
  role: BoardRole;
  orgId: string | null;
  folderId: string | null;
}

/** Ответ /api/boards/:id/ws-token */
export interface WsTokenResponse {
  token: string;
  /** Базовый адрес WS-сервера (без комнаты) */
  url: string;
  room: string;
  role: BoardRole;
  /** Политики организации — клиент скрывает запрещённые действия (копирование, удаление чужого) */
  policy: OrgPolicy;
  user: { id: string; name: string; color: string; anonymous: boolean };
  expiresAt: number;
}

export const EXPORT_FORMATS = ['png', 'pdf', 'svg'] as const;
export const EXPORT_SCOPES = ['board', 'selection', 'frame', 'frames'] as const;

/** Запись об экспорте: сервер проверяет право (политика allowExport) и пишет аудит */
export const exportRequestSchema = z.object({
  format: z.enum(EXPORT_FORMATS),
  scope: z.enum(EXPORT_SCOPES),
  pages: z.number().int().min(1).max(500),
});
export type ExportRequest = z.infer<typeof exportRequestSchema>;

export const SNAPSHOT_REASONS = ['AUTO', 'LAST_CLIENT', 'MANUAL', 'PRE_RESTORE', 'RESTORE', 'IMPORT'] as const;
export type SnapshotReasonValue = (typeof SNAPSHOT_REASONS)[number];

export const SNAPSHOT_REASON_LABELS: Record<SnapshotReasonValue, string> = {
  AUTO: 'Автосохранение',
  LAST_CLIENT: 'Все вышли с доски',
  MANUAL: 'Сохранено вручную',
  PRE_RESTORE: 'Перед восстановлением',
  RESTORE: 'Восстановлена версия',
  IMPORT: 'Импорт',
};

/** POST /api/boards/:id/versions?label=…&reason=… (тело — Yjs-состояние клиента) */
export const createVersionQuerySchema = z.object({
  label: z.string().trim().max(120).optional(),
  reason: z.enum(['MANUAL', 'PRE_RESTORE']).default('MANUAL'),
});

export interface BoardVersionDto {
  id: string;
  createdAt: string;
  reason: SnapshotReasonValue;
  label: string | null;
  objectCount: number;
  sizeBytes: number;
  createdByName: string | null;
  /** Кто правил доску с прошлой версии */
  authorNames: string[];
}

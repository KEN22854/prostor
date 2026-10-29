import { z } from 'zod';

/**
 * Инструменты левой панели доски. Закреплённые видны всегда, остальные —
 * в меню «…». Набор закреплённых пользователь выбирает в настройках профиля.
 */
export const TOOLBAR_TOOL_IDS = [
  'select',
  'hand',
  'sticky',
  'shape',
  'shapes',
  'arrow',
  'line',
  'text',
  'table',
  'chart',
  'pen',
  'frame',
  'comment',
  'laser',
  'eraser',
  'image',
  'pdf',
  'import',
  'stickers',
  'audio',
  'video',
  'feed',
  'link',
  'ai-image',
] as const;

export type ToolbarToolId = (typeof TOOLBAR_TOOL_IDS)[number];

export const DEFAULT_PINNED_TOOLS: readonly ToolbarToolId[] = [
  'select',
  'hand',
  'sticky',
  'shape',
  'arrow',
  'text',
  'pen',
  'frame',
  'image',
  'comment',
];

/** Пустой список в профиле — значит «как по умолчанию» */
export const toolbarSettingsSchema = z.object({
  pinned: z
    .array(z.enum(TOOLBAR_TOOL_IDS))
    .max(TOOLBAR_TOOL_IDS.length)
    .transform((ids) => [...new Set(ids)]),
});

export function resolvePinnedTools(saved: readonly string[] | null | undefined): ToolbarToolId[] {
  const known = (saved ?? []).filter((id): id is ToolbarToolId =>
    (TOOLBAR_TOOL_IDS as readonly string[]).includes(id),
  );
  return known.length > 0 ? known : [...DEFAULT_PINNED_TOOLS];
}

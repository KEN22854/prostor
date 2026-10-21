/**
 * Палитра курсоров: насыщенные цвета, различимые на светлом и тёмном холсте
 * и между собой (соседние оттенки разнесены по кругу).
 */
export const PRESENCE_COLORS = [
  '#e5484d',
  '#f76b15',
  '#ffb224',
  '#30a46c',
  '#12a594',
  '#0091ff',
  '#3e63dd',
  '#8e4ec6',
  '#d6409f',
  '#a18072',
] as const;

/** Детерминированный цвет по id: у пользователя один цвет во всех вкладках и сессиях */
export function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % PRESENCE_COLORS.length;
  return PRESENCE_COLORS[index] ?? PRESENCE_COLORS[0];
}

/** Инициалы для аватара-заглушки: «Анна Смирнова» → «АС» */
export function initials(name: string | null | undefined, fallback = '?'): string {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`
      : (parts[0]?.slice(0, 2) ?? '');
  return letters.toUpperCase() || fallback;
}

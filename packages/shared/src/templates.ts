import { z } from 'zod';

/** Сохранить доску как шаблон: только для себя или для всей организации доски */
export const saveTemplateSchema = z.object({
  title: z.string().trim().min(1, 'Введите название').max(120),
  description: z.string().trim().max(500).optional(),
  scope: z.enum(['personal', 'org']).default('personal'),
});
export type SaveTemplateInput = z.input<typeof saveTemplateSchema>;

export interface BoardTemplateDto {
  id: string;
  title: string;
  description: string | null;
  /** null — личный шаблон */
  org: { id: string; name: string } | null;
  owner: { id: string; name: string | null };
  objectCount: number;
  createdAt: string;
  /** Можно удалить: автор или администратор организации */
  canDelete: boolean;
}

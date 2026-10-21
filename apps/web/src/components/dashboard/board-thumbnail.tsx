import {
  GitBranch,
  KanbanSquare,
  LayoutTemplate,
  Network,
  RefreshCcw,
  Route,
  Square,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  blank: Square,
  mindmap: Network,
  kanban: KanbanSquare,
  retro: RefreshCcw,
  flowchart: Workflow,
  bpmn: GitBranch,
  swot: LayoutTemplate,
  'story-map': Route,
};

/** Детерминированный оттенок по id — у доски всегда один и тот же «цвет» */
function hueFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) % 360;
  return h;
}

interface BoardThumbnailProps {
  id: string;
  templateKey: string | null;
  thumbnailUrl: string | null;
}

/**
 * Превью доски. Пока worker не рендерит настоящие миниатюры (итерация 7),
 * показываем градиент с иконкой шаблона.
 */
export function BoardThumbnail({ id, templateKey, thumbnailUrl }: BoardThumbnailProps) {
  if (thumbnailUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- превью отдаёт /api/assets с проверкой прав, оптимизатор next/image тут не нужен
      <img
        src={thumbnailUrl}
        alt=""
        className="aspect-[16/10] w-full object-cover"
        loading="lazy"
      />
    );
  }
  const hue = hueFor(id);
  const Icon = ICONS[templateKey ?? 'blank'] ?? Square;
  return (
    <div
      className="flex aspect-[16/10] w-full items-center justify-center"
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 92%), hsl(${(hue + 40) % 360} 70% 84%))`,
      }}
      aria-hidden
    >
      <Icon className="size-8 text-black/30" strokeWidth={1.5} />
    </div>
  );
}

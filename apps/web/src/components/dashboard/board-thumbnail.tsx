'use client';

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
import { useEffect, useRef, useState } from 'react';
import { boardPreview } from '@/lib/export/board-preview';
import { cn } from '@/lib/utils';

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
  return 235 + (h % 95);
}

interface BoardThumbnailProps {
  id: string;
  templateKey: string | null;
  thumbnailUrl: string | null;
  /** Время последней правки доски: есть — рисуем её настоящее содержимое */
  version?: string;
}

/**
 * Превью доски: её содержимое, нарисованное тем же рендером, что экспорт в PNG.
 * Рисуется, когда карточка появляется на экране, и кэшируется до следующей правки.
 * Пустая доска и шаблоны в окне создания — градиент с иконкой шаблона.
 */
export function BoardThumbnail({ id, templateKey, thumbnailUrl, version }: BoardThumbnailProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<string | null | undefined>(version ? undefined : null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!version || !el || thumbnailUrl) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        void boardPreview(id, version).then((url) => !cancelled && setPreview(url));
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [id, version, thumbnailUrl]);

  if (version && !thumbnailUrl && preview !== null) {
    return (
      <div ref={ref} className="relative aspect-[16/10] w-full overflow-hidden bg-canvas">
        {!loaded ? <div className="skeleton absolute inset-0" aria-hidden /> : null}
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- object URL нарисованного в браузере превью
          <img
            src={preview}
            alt=""
            onLoad={() => setLoaded(true)}
            className={cn(
              'absolute inset-0 size-full object-contain transition-opacity duration-500 ease-smooth',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
          />
        ) : null}
      </div>
    );
  }

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

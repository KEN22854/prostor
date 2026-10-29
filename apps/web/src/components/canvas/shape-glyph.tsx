import type { ReactElement } from 'react';
import type { ShapeElement } from '@prostor/shared';
import { shapePathData } from '@/lib/canvas/shape-paths';
import { cn } from '@/lib/utils';

type Kind = ShapeElement['shape'];

/** Значок фигуры по её настоящей геометрии — в палитре и библиотеке */
export function ShapeGlyph({ kind, className }: { kind: Kind; className?: string }) {
  // Квадратные фигуры — в квадрате, вытянутые (блок-схемы) — пошире
  const wide = !['ellipse', 'triangle', 'star', 'plus', 'cylinder'].includes(kind);
  const w = wide ? 22 : 18;
  const h = wide ? 14 : 18;
  return (
    <svg
      viewBox={`-1.5 -1.5 ${w + 3} ${h + 3}`}
      className={cn('size-4', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={shapePathData(kind, w, h)} />
    </svg>
  );
}

const glyphs = new Map<Kind, (props: { className?: string }) => ReactElement>();

/** Компонент-иконка для фигуры (как у lucide) — для кнопок палитры */
export function shapeIcon(kind: Kind): (props: { className?: string }) => ReactElement {
  let icon = glyphs.get(kind);
  if (!icon) {
    icon = function ShapeIcon({ className }: { className?: string }) {
      return <ShapeGlyph kind={kind} className={className} />;
    };
    glyphs.set(kind, icon);
  }
  return icon;
}

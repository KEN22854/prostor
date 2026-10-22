'use client';

import { memo } from 'react';
import type {
  AudioElement,
  BoardElement,
  EmbedElement,
  FrameElement,
  ImageElement,
  LineElement,
  PathElement,
  ShapeElement,
  StickyElement,
  TableElement,
  TextElement,
} from '@prostor/shared';
import { AudioShape } from '@/components/canvas/shapes/audio-shape';
import { BasicShape } from '@/components/canvas/shapes/basic-shape';
import { EmbedShape } from '@/components/canvas/shapes/embed-shape';
import { FrameShape } from '@/components/canvas/shapes/frame-shape';
import { ImageShape } from '@/components/canvas/shapes/image-shape';
import { LineShape } from '@/components/canvas/shapes/line-shape';
import { TableShape } from '@/components/canvas/shapes/table-shape';
import { PathShape } from '@/components/canvas/shapes/path-shape';
import { PlaceholderShape } from '@/components/canvas/shapes/placeholder-shape';
import { StickyShape } from '@/components/canvas/shapes/sticky-shape';
import { TextShape } from '@/components/canvas/shapes/text-shape';
import type { DetailLevel } from '@/lib/canvas/constants';

interface ElementNodeProps {
  element: BoardElement;
  detail: DetailLevel;
  /** Текст элемента сейчас в inline-редакторе */
  editing?: boolean;
  /** Ячейка таблицы в редакторе (только у редактируемой таблицы) */
  editingCell?: { row: number; col: number } | null;
}

/**
 * Диспетчер по типу элемента.
 *
 * memo со сравнением по ссылке: ElementStore создаёт новый объект только для
 * изменённого элемента, поэтому при правке одного стикера на доске из 1 500
 * видимых перерисовывается ровно одна React-ветка (а Konva — только слой).
 */
export const ElementNode = memo(function ElementNode({
  element,
  detail,
  editing = false,
  editingCell = null,
}: ElementNodeProps) {
  switch (element.type) {
    case 'sticky':
      return <StickyShape element={element as StickyElement} detail={detail} hideText={editing} />;
    case 'shape':
      return <BasicShape element={element as ShapeElement} detail={detail} hideText={editing} />;
    case 'text':
      return <TextShape element={element as TextElement} detail={detail} hideText={editing} />;
    case 'line':
    case 'arrow':
      return <LineShape element={element as LineElement} />;
    case 'path':
      return <PathShape element={element as PathElement} />;
    case 'image':
      return <ImageShape element={element as ImageElement} detail={detail} />;
    case 'frame':
      return <FrameShape element={element as FrameElement} />;
    case 'audio':
      return <AudioShape element={element as AudioElement} detail={detail} />;
    case 'embed':
      return <EmbedShape element={element as EmbedElement} detail={detail} />;
    case 'table':
      return (
        <TableShape element={element as TableElement} detail={detail} editingCell={editingCell} />
      );
    default:
      return <PlaceholderShape element={element} detail={detail} />;
  }
});

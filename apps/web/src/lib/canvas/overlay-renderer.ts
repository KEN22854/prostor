import Konva from 'konva';
import type { Bounds } from '@prostor/shared';
import type { GuideLine } from '@/lib/canvas/snapping';

const ACCENT = '#6366f1';
const GUIDE = '#e5484d';

/**
 * Временная графика взаимодействий на отдельном Konva-слое: рамка выделения,
 * направляющие привязки, превью росчерка и создаваемой фигуры.
 *
 * Обновляется императивно на каждом pointermove: через React это был бы
 * ре-рендер 60 раз в секунду ради одного прямоугольника. Толщины линий
 * делятся на zoom — на экране они всегда 1–2 px.
 */
export class OverlayRenderer {
  private readonly marquee = new Konva.Rect({
    visible: false,
    fill: 'rgba(99,102,241,0.08)',
    stroke: ACCENT,
    listening: false,
  });
  private readonly guides = new Konva.Group({ listening: false });
  private readonly preview = new Konva.Line({
    visible: false,
    listening: false,
    lineCap: 'round',
    lineJoin: 'round',
  });
  private readonly shapePreview = new Konva.Rect({
    visible: false,
    listening: false,
    stroke: ACCENT,
    dash: [6, 4],
  });
  private readonly selectionBox = new Konva.Rect({
    visible: false,
    listening: false,
    stroke: ACCENT,
  });

  constructor(
    private readonly layer: Konva.Layer,
    private readonly getZoom: () => number,
  ) {
    layer.add(this.selectionBox, this.shapePreview, this.preview, this.guides, this.marquee);
  }

  private get px(): number {
    return 1 / this.getZoom();
  }

  setMarquee(b: Bounds | null): void {
    if (!b) {
      this.marquee.visible(false);
    } else {
      this.marquee.setAttrs({
        visible: true,
        x: b.minX,
        y: b.minY,
        width: b.maxX - b.minX,
        height: b.maxY - b.minY,
        strokeWidth: this.px,
      });
    }
    this.layer.batchDraw();
  }

  setGuides(lines: readonly GuideLine[]): void {
    this.guides.destroyChildren();
    for (const l of lines) {
      this.guides.add(
        new Konva.Line({
          points: [l.x1, l.y1, l.x2, l.y2],
          stroke: GUIDE,
          strokeWidth: this.px,
          dash: [4 * this.px, 4 * this.px],
          listening: false,
        }),
      );
    }
    this.layer.batchDraw();
  }

  /** Превью росчерка карандаша / линии создаваемой стрелки */
  setStroke(
    points: readonly number[] | null,
    style?: { color: string; width: number; opacity?: number },
  ): void {
    if (!points || points.length < 2) {
      this.preview.visible(false);
    } else {
      this.preview.setAttrs({
        visible: true,
        points: [...points],
        stroke: style?.color ?? ACCENT,
        strokeWidth: style?.width ?? 2,
        opacity: style?.opacity ?? 1,
        tension: 0.3,
      });
    }
    this.layer.batchDraw();
  }

  /** Пунктирная рамка создаваемой фигуры */
  setShapePreview(b: Bounds | null): void {
    if (!b) {
      this.shapePreview.visible(false);
    } else {
      this.shapePreview.setAttrs({
        visible: true,
        x: b.minX,
        y: b.minY,
        width: b.maxX - b.minX,
        height: b.maxY - b.minY,
        strokeWidth: this.px * 1.5,
        dash: [6 * this.px, 4 * this.px],
      });
    }
    this.layer.batchDraw();
  }

  /**
   * Рамка выделения, когда Transformer не может её показать: выделены объекты
   * вне отрисованной области (виртуализация) или режим LOD без отдельных нод.
   */
  setSelectionBox(b: Bounds | null): void {
    if (!b) {
      this.selectionBox.visible(false);
    } else {
      this.selectionBox.setAttrs({
        visible: true,
        x: b.minX,
        y: b.minY,
        width: b.maxX - b.minX,
        height: b.maxY - b.minY,
        strokeWidth: this.px * 1.5,
      });
    }
    this.layer.batchDraw();
  }

  clearTransient(): void {
    this.marquee.visible(false);
    this.preview.visible(false);
    this.shapePreview.visible(false);
    this.guides.destroyChildren();
    this.layer.batchDraw();
  }

  destroy(): void {
    this.layer.destroyChildren();
  }
}

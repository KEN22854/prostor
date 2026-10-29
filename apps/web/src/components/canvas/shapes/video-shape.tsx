'use client';

import { Circle, Group, Image as KonvaImage, Rect, RegularPolygon, Text } from 'react-konva';
import useImage from 'use-image';
import { assetUrl, type VideoElement } from '@prostor/shared';
import { formatDuration } from '@/components/canvas/shapes/audio-shape';
import type { DetailLevel } from '@/lib/canvas/constants';
import { canvasFont } from '@/lib/canvas/fonts';
import { useCanvasStore } from '@/stores/canvas-store';

/**
 * Видео на доске: кадр-обложка с кнопкой ▶, названием и длительностью.
 * Двойной клик — плеер прямо поверх карточки (VideoPlayer).
 */
export function VideoShape({
  element: el,
  detail,
}: {
  element: VideoElement;
  detail: DetailLevel;
}) {
  const playing = useCanvasStore((s) => s.playingVideoId === el.id);
  const [poster] = useImage(el.posterAssetId && detail !== 'lod' ? assetUrl(el.posterAssetId) : '');
  const font = canvasFont('Inter');
  const r = Math.min(36, el.width / 8, el.height / 4);

  return (
    <Group x={el.x} y={el.y} rotation={el.rotation} opacity={el.opacity} id={el.id} name="element">
      <Group
        clipFunc={(ctx) => {
          ctx.beginPath();
          ctx.roundRect(0, 0, el.width, el.height, 14);
          ctx.closePath();
        }}
      >
        <Rect
          width={el.width}
          height={el.height}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: el.width, y: el.height }}
          fillLinearGradientColorStops={[0, '#c4b5fd', 1, '#f0abfc']}
          perfectDrawEnabled={false}
        />
        {poster ? (
          <KonvaImage
            image={poster}
            width={el.width}
            height={el.height}
            perfectDrawEnabled={false}
          />
        ) : null}
        {detail === 'full' ? (
          <Rect
            y={el.height * 0.6}
            width={el.width}
            height={el.height * 0.4}
            fillLinearGradientStartPoint={{ x: 0, y: 0 }}
            fillLinearGradientEndPoint={{ x: 0, y: el.height * 0.4 }}
            fillLinearGradientColorStops={[0, 'rgba(15,10,30,0)', 1, 'rgba(15,10,30,0.65)']}
            listening={false}
            perfectDrawEnabled={false}
          />
        ) : null}
      </Group>
      <Rect
        width={el.width}
        height={el.height}
        cornerRadius={14}
        stroke={playing ? '#9b6bdf' : 'rgba(15,10,30,0.12)'}
        strokeWidth={playing ? 3 : 1}
        strokeScaleEnabled={false}
        listening={false}
        perfectDrawEnabled={false}
      />
      {playing ? null : (
        <Group x={el.width / 2} y={el.height / 2} listening={false}>
          <Circle
            radius={r}
            fill="rgba(255,255,255,0.92)"
            shadowColor="#000"
            shadowOpacity={0.2}
            shadowBlur={detail === 'full' ? 12 : 0}
            perfectDrawEnabled={false}
          />
          <RegularPolygon
            sides={3}
            radius={r * 0.45}
            rotation={90}
            x={r * 0.08}
            fill="#9b6bdf"
            perfectDrawEnabled={false}
          />
        </Group>
      )}
      {detail === 'full' ? (
        <>
          <Text
            x={14}
            y={el.height - 30}
            width={el.width - 90}
            text={el.title}
            fontFamily={font}
            fontSize={14}
            fontStyle="bold"
            fill="#ffffff"
            wrap="none"
            ellipsis
            listening={false}
            perfectDrawEnabled={false}
          />
          {el.durationMs !== undefined ? (
            <Text
              x={el.width - 70}
              y={el.height - 29}
              width={56}
              align="right"
              text={formatDuration(el.durationMs)}
              fontFamily={font}
              fontSize={12}
              fill="#ffffff"
              listening={false}
              perfectDrawEnabled={false}
            />
          ) : null}
        </>
      ) : null}
    </Group>
  );
}

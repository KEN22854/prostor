'use client';

import { useContext } from 'react';
import { Circle, Group, Image as KonvaImage, Rect, RegularPolygon, Text } from 'react-konva';
import useImage from 'use-image';
import { assetUrl, type EmbedElement } from '@prostor/shared';
import type { DetailLevel } from '@/lib/canvas/constants';
import { EMBED_CARD } from '@/lib/canvas/element-factory';
import { canvasFont } from '@/lib/canvas/fonts';
import { PreloadedImagesContext } from '@/lib/export/preloaded-images';
import { useT } from '@/lib/i18n/client';

const PROVIDER_COLOR: Record<string, string> = {
  youtube: '#ff0033',
  vimeo: '#1ab7ea',
  loom: '#625df5',
  figma: '#a259ff',
  google: '#1a73e8',
  miro: '#ffd02f',
  link: '#64748b',
};

/**
 * Карточка ссылки: превью (ассет доски), заголовок, сайт. У сервисов с
 * плеером — кнопка ▶ поверх превью; сам плеер (iframe) открывается
 * по двойному клику поверх карточки (EmbedPlayer).
 */
export function EmbedShape({
  element: el,
  detail,
}: {
  element: EmbedElement;
  detail: DetailLevel;
}) {
  const t = useT();
  const preloaded = useContext(PreloadedImagesContext).get(el.imageAssetId ?? '');
  const [loaded, status] = useImage(preloaded || !el.imageAssetId ? '' : assetUrl(el.imageAssetId));
  const image = preloaded ?? (status === 'loaded' ? loaded : undefined);
  const mediaHeight = Math.max(0, el.height - EMBED_CARD.textHeight);
  const accent = PROVIDER_COLOR[el.provider] ?? '#64748b';
  const font = canvasFont('Inter');
  const playable = Boolean(el.embedUrl);

  return (
    <Group x={el.x} y={el.y} rotation={el.rotation} opacity={el.opacity} id={el.id} name="element">
      <Rect
        width={el.width}
        height={el.height}
        fill="#ffffff"
        stroke="#e2e8f0"
        strokeWidth={1}
        cornerRadius={10}
        shadowColor="#0f172a"
        shadowOpacity={0.08}
        shadowBlur={detail === 'full' ? 12 : 0}
        shadowOffsetY={2}
        strokeScaleEnabled={false}
        perfectDrawEnabled={false}
      />
      {mediaHeight > 0 ? (
        <Group
          clipFunc={(ctx) => {
            // Скруглённый верх карточки: превью не вылезает за углы
            const r = 10;
            ctx.beginPath();
            ctx.moveTo(r, 0);
            ctx.lineTo(el.width - r, 0);
            ctx.quadraticCurveTo(el.width, 0, el.width, r);
            ctx.lineTo(el.width, mediaHeight);
            ctx.lineTo(0, mediaHeight);
            ctx.lineTo(0, r);
            ctx.quadraticCurveTo(0, 0, r, 0);
            ctx.closePath();
          }}
        >
          {image ? (
            <KonvaImage
              image={image}
              width={el.width}
              height={mediaHeight}
              perfectDrawEnabled={false}
            />
          ) : (
            <Rect width={el.width} height={mediaHeight} fill="#f1f5f9" perfectDrawEnabled={false} />
          )}
          {playable && detail !== 'lod' ? (
            <Group x={el.width / 2} y={mediaHeight / 2} listening={false}>
              <Circle radius={26} fill="rgba(15,23,42,0.72)" perfectDrawEnabled={false} />
              <RegularPolygon
                sides={3}
                radius={11}
                rotation={90}
                x={3}
                fill="#ffffff"
                perfectDrawEnabled={false}
              />
            </Group>
          ) : null}
        </Group>
      ) : null}
      <Rect
        x={0}
        y={mediaHeight}
        width={4}
        height={EMBED_CARD.textHeight}
        fill={accent}
        listening={false}
      />
      {detail === 'full' ? (
        <>
          <Text
            x={16}
            y={mediaHeight + 12}
            width={el.width - 28}
            height={40}
            text={el.title}
            fontFamily={font}
            fontSize={15}
            fontStyle="bold"
            fill="#0f172a"
            wrap="word"
            ellipsis
            listening={false}
            perfectDrawEnabled={false}
          />
          <Text
            x={16}
            y={mediaHeight + EMBED_CARD.textHeight - 22}
            width={el.width - 28}
            text={`${el.siteName}${playable ? t(' · двойной клик — открыть') : t(' · двойной клик — перейти')}`}
            fontFamily={font}
            fontSize={12}
            fill="#64748b"
            wrap="none"
            ellipsis
            listening={false}
            perfectDrawEnabled={false}
          />
        </>
      ) : null}
    </Group>
  );
}

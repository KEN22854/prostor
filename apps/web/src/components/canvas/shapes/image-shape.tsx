'use client';

import { useContext } from 'react';
import { Group, Image as KonvaImage, Rect, Text } from 'react-konva';
import useImage from 'use-image';
import { assetUrl, type ImageElement } from '@prostor/shared';
import type { DetailLevel } from '@/lib/canvas/constants';
import { PreloadedImagesContext } from '@/lib/export/preloaded-images';
import { useT } from '@/lib/i18n/client';

/**
 * Изображение. Файл отдаёт web (/api/assets/:id) с проверкой прав —
 * same-origin, поэтому canvas не «пачкается» и экспорт PNG/PDF работает.
 * use-image кеширует загрузку: повторный рендер ноды не качает файл заново.
 */
/**
 * crop в пикселях исходника → в пикселях загруженной картинки. У SVG-стикеров
 * «исходник» на доске — растр 512 px, а браузер грузит SVG в размерах viewBox.
 */
function konvaCrop(el: ImageElement, image: HTMLImageElement) {
  if (!el.crop) return undefined;
  const kx = (image.naturalWidth || el.naturalWidth) / el.naturalWidth;
  const ky = (image.naturalHeight || el.naturalHeight) / el.naturalHeight;
  return {
    x: el.crop.x * kx,
    y: el.crop.y * ky,
    width: el.crop.width * kx,
    height: el.crop.height * ky,
  };
}

export function ImageShape({
  element: el,
  detail,
}: {
  element: ImageElement;
  detail: DetailLevel;
}) {
  const t = useT();
  // При экспорте картинка уже загружена — офлайн-Stage рисуется сразу
  const preloaded = useContext(PreloadedImagesContext).get(el.assetId);
  const [loaded, loadStatus] = useImage(preloaded ? '' : assetUrl(el.assetId));
  const image = preloaded ?? loaded;
  const status = preloaded ? 'loaded' : loadStatus;

  return (
    <Group x={el.x} y={el.y} rotation={el.rotation} opacity={el.opacity} id={el.id} name="element">
      {image && status === 'loaded' ? (
        <KonvaImage
          image={image}
          width={el.width}
          height={el.height}
          crop={konvaCrop(el, image)}
          perfectDrawEnabled={false}
        />
      ) : (
        <>
          <Rect
            width={el.width}
            height={el.height}
            fill={status === 'failed' ? 'rgba(229,72,77,0.08)' : 'rgba(148,163,184,0.15)'}
            stroke={status === 'failed' ? '#e5484d' : '#94a3b8'}
            strokeWidth={1}
            strokeScaleEnabled={false}
            dash={[6, 4]}
            perfectDrawEnabled={false}
          />
          {detail === 'full' ? (
            <Text
              width={el.width}
              height={el.height}
              text={status === 'failed' ? t('Не удалось загрузить изображение') : t('Загрузка…')}
              fontSize={14}
              fill="#64748b"
              align="center"
              verticalAlign="middle"
              listening={false}
            />
          ) : null}
        </>
      )}
    </Group>
  );
}

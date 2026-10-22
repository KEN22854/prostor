'use client';

import { Circle, Group, Rect, RegularPolygon, Text } from 'react-konva';
import type { AudioElement } from '@prostor/shared';
import type { DetailLevel } from '@/lib/canvas/constants';
import { canvasFont } from '@/lib/canvas/fonts';
import { useCanvasStore } from '@/stores/canvas-store';

const BARS = 28;

/** «Волна» карточки: детерминирована id, чтобы у всех участников одинаковая */
function waveform(id: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return Array.from({ length: BARS }, (_, i) => {
    h = Math.imul(h ^ (i + 1), 16777619);
    const r = ((h >>> 0) % 1000) / 1000;
    return 0.25 + 0.75 * Math.abs(Math.sin(i * 0.55 + r * 2.5)) * (0.55 + r * 0.45);
  });
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Аудио на доске: карточка с кнопкой ▶, названием, длительностью и «волной».
 * Звук играет HTML-плеер поверх карточки (AudioPlayer) — двойной клик.
 */
export function AudioShape({
  element: el,
  detail,
}: {
  element: AudioElement;
  detail: DetailLevel;
}) {
  const playing = useCanvasStore((s) => s.playingAudioId === el.id);
  const bars = waveform(el.id);
  const padX = 76;
  const waveWidth = Math.max(0, el.width - padX - 16);
  const barStep = waveWidth / BARS;
  const font = canvasFont('Inter');

  return (
    <Group x={el.x} y={el.y} rotation={el.rotation} opacity={el.opacity} id={el.id} name="element">
      <Rect
        width={el.width}
        height={el.height}
        fill="#ffffff"
        stroke={playing ? el.color : '#e2e8f0'}
        strokeWidth={playing ? 2 : 1}
        cornerRadius={14}
        strokeScaleEnabled={false}
        shadowColor="#0f172a"
        shadowOpacity={0.08}
        shadowBlur={detail === 'full' ? 10 : 0}
        shadowOffsetY={2}
        perfectDrawEnabled={false}
      />
      <Group x={38} y={el.height / 2} listening={false}>
        <Circle radius={22} fill={el.color} perfectDrawEnabled={false} />
        {playing ? (
          <>
            <Rect x={-7} y={-8} width={5} height={16} fill="#ffffff" cornerRadius={1} />
            <Rect x={2} y={-8} width={5} height={16} fill="#ffffff" cornerRadius={1} />
          </>
        ) : (
          <RegularPolygon
            sides={3}
            radius={10}
            rotation={90}
            x={2}
            fill="#ffffff"
            perfectDrawEnabled={false}
          />
        )}
      </Group>
      {detail === 'full' ? (
        <>
          <Text
            x={padX}
            y={12}
            width={el.width - padX - 60}
            text={el.title}
            fontFamily={font}
            fontSize={14}
            fontStyle="bold"
            fill="#0f172a"
            wrap="none"
            ellipsis
            listening={false}
            perfectDrawEnabled={false}
          />
          <Text
            x={el.width - 60}
            y={13}
            width={46}
            align="right"
            text={formatDuration(el.durationMs)}
            fontFamily={font}
            fontSize={12}
            fill="#64748b"
            listening={false}
            perfectDrawEnabled={false}
          />
        </>
      ) : null}
      {detail !== 'lod'
        ? bars.map((v, i) => {
            const h = v * 22;
            return (
              <Rect
                key={i}
                x={padX + i * barStep}
                y={el.height - 18 - h}
                width={Math.max(1.5, barStep * 0.55)}
                height={h}
                cornerRadius={1}
                fill={el.color}
                opacity={0.35 + v * 0.45}
                listening={false}
                perfectDrawEnabled={false}
              />
            );
          })
        : null}
    </Group>
  );
}

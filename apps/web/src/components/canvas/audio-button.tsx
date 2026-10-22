'use client';

import { Mic, Music, Square, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDuration } from '@/components/canvas/shapes/audio-shape';
import { visibleBounds, type Point } from '@/lib/canvas/viewport';
import { useT } from '@/lib/i18n/client';
import { useCanvasStore } from '@/stores/canvas-store';

const MAX_RECORDING_MS = 10 * 60_000;

/** Формат записи, который умеет браузер (Chrome/Firefox — webm/opus, Safari — mp4) */
function recorderMime(): string | undefined {
  for (const type of [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

interface AudioButtonProps {
  onInsert: (
    file: Blob,
    at: Point,
    opts?: { title?: string; durationMs?: number },
  ) => Promise<void>;
}

/**
 * Аудио на доску: загрузить файл (MP3, WAV, OGG, M4A, FLAC) или записать
 * с микрофона — голосовая заметка до 10 минут.
 */
export function AudioButton({ onInsert }: AudioButtonProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const startedAt = useRef(0);

  const center = (): Point => {
    const { camera, size } = useCanvasStore.getState();
    const v = visibleBounds(camera, size);
    return { x: (v.minX + v.maxX) / 2, y: (v.minY + v.maxY) / 2 };
  };

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      if (ms >= MAX_RECORDING_MS) recorder.current?.stop();
    }, 250);
    return () => clearInterval(timer);
  }, [recording]);

  // Закрыли страницу/доску во время записи — освобождаем микрофон
  useEffect(() => () => recorder.current?.stream.getTracks().forEach((tr) => tr.stop()), []);

  const startRecording = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error(t('Нет доступа к микрофону — разрешите его в настройках браузера'));
      return;
    }
    const mimeType = recorderMime();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      setRecording(false);
      const durationMs = Date.now() - startedAt.current;
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      recorder.current = null;
      if (blob.size === 0) return;
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      void onInsert(blob, center(), { title: t('Голосовая заметка {time}', { time }), durationMs });
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    setElapsed(0);
    rec.start(1000);
    setRecording(true);
  };

  return (
    <Popover open={open || recording} onOpenChange={(v) => !recording && setOpen(v)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={recording ? 'size-9 animate-pulse text-destructive' : 'size-9'}
              aria-label={t('Аудио')}
            >
              <Music />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">{t('Аудио: файл или запись с микрофона')}</TooltipContent>
      </Tooltip>
      <PopoverContent
        side="right"
        align="start"
        className="w-64 space-y-2 p-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {recording ? (
          <div className="space-y-2 text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-medium">
              <span className="size-2.5 animate-pulse rounded-full bg-destructive" aria-hidden />
              {t('Идёт запись')} {formatDuration(elapsed)}
            </p>
            <Button
              className="w-full"
              variant="destructive"
              onClick={() => recorder.current?.stop()}
            >
              <Square /> {t('Остановить и добавить')}
            </Button>
          </div>
        ) : (
          <>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                setOpen(false);
                fileRef.current?.click();
              }}
            >
              <Upload /> {t('Загрузить аудиофайл')}
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => void startRecording()}
            >
              <Mic /> {t('Записать с микрофона')}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t('MP3, WAV, OGG, M4A, FLAC до 50 МБ; аудиофайл можно и просто перетащить на доску')}
            </p>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void onInsert(file, center());
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

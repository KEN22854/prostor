'use client';

import { Camera, Mic, MonitorPlay, Pause, Play, Square, Upload, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { formatDuration } from '@/components/canvas/shapes/audio-shape';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { visibleBounds, type Point } from '@/lib/canvas/viewport';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';

const MAX_RECORDING_MS = 30 * 60_000;

/** Формат записи, который умеет браузер (Chrome/Firefox — WebM, Safari — MP4) */
function recorderMime(): string | undefined {
  for (const type of [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

interface VideoButtonProps {
  onInsert: (
    file: Blob,
    at: Point,
    opts?: { title?: string; durationMs?: number },
  ) => Promise<void>;
}

interface Session {
  recorder: MediaRecorder;
  streams: MediaStream[];
  audio: AudioContext | null;
  startedAt: number;
  pausedMs: number;
  pausedAt: number | null;
}

/**
 * Видео на доску: загрузить файл (MP4, WebM, MOV) или записать экран в стиле
 * Loom — с микрофоном и кружком камеры. Кружок — поверх страницы: при записи
 * всего экрана или этой вкладки он попадает в запись сам, без склейки кадров
 * (склейка в фоновой вкладке тормозила бы).
 */
export function VideoButton({ onInsert }: VideoButtonProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [withMic, setWithMic] = useState(true);
  const [withCamera, setWithCamera] = useState(true);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [camera, setCamera] = useState<MediaStream | null>(null);
  const session = useRef<Session | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const center = (): Point => {
    const { camera: cam, size } = useCanvasStore.getState();
    const v = visibleBounds(cam, size);
    return { x: (v.minX + v.maxX) / 2, y: (v.minY + v.maxY) / 2 };
  };

  const elapsedOf = (s: Session) =>
    Date.now() - s.startedAt - s.pausedMs - (s.pausedAt ? Date.now() - s.pausedAt : 0);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const s = session.current;
      if (!s) return;
      const ms = elapsedOf(s);
      setElapsed(ms);
      if (ms >= MAX_RECORDING_MS) s.recorder.stop();
    }, 250);
    return () => clearInterval(timer);
  }, [recording]);

  // Ушли с доски во время записи — освобождаем экран, камеру и микрофон
  useEffect(
    () => () => {
      session.current?.streams.forEach((st) => st.getTracks().forEach((tr) => tr.stop()));
      void session.current?.audio?.close();
    },
    [],
  );

  const start = async () => {
    setOpen(false);
    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });
    } catch {
      toast.error(t('Запись экрана отменена или не разрешена'));
      return;
    }
    const streams = [display];
    let mic: MediaStream | null = null;
    if (withMic) {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
      if (mic) streams.push(mic);
      else toast.warning(t('Микрофон недоступен — запись без голоса'));
    }
    if (withCamera) {
      const cam = await navigator.mediaDevices
        .getUserMedia({ video: { width: 320, height: 320, facingMode: 'user' } })
        .catch(() => null);
      if (cam) {
        streams.push(cam);
        setCamera(cam);
      } else toast.warning(t('Камера недоступна — запись без кружка'));
    }

    // Звук системы и микрофон — в одну дорожку
    let audio: AudioContext | null = null;
    const tracks: MediaStreamTrack[] = [...display.getVideoTracks()];
    const audioSources = [display, mic].filter(
      (s): s is MediaStream => s !== null && s.getAudioTracks().length > 0,
    );
    if (audioSources.length > 0) {
      audio = new AudioContext();
      const dest = audio.createMediaStreamDestination();
      for (const s of audioSources) audio.createMediaStreamSource(s).connect(dest);
      tracks.push(...dest.stream.getAudioTracks());
    }

    const mimeType = recorderMime();
    const recorder = new MediaRecorder(
      new MediaStream(tracks),
      mimeType ? { mimeType } : undefined,
    );
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = () => {
      const s = session.current;
      const durationMs = s ? elapsedOf(s) : undefined;
      streams.forEach((st) => st.getTracks().forEach((tr) => tr.stop()));
      void audio?.close();
      session.current = null;
      setRecording(false);
      setPaused(false);
      setCamera(null);
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      if (blob.size === 0) return;
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      void onInsert(blob, center(), { title: t('Запись экрана {time}', { time }), durationMs });
    };
    // «Закрыть доступ» в панели браузера — тоже конец записи
    display.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (recorder.state !== 'inactive') recorder.stop();
    });
    session.current = {
      recorder,
      streams,
      audio,
      startedAt: Date.now(),
      pausedMs: 0,
      pausedAt: null,
    };
    setElapsed(0);
    recorder.start(1000);
    setRecording(true);
  };

  const togglePause = () => {
    const s = session.current;
    if (!s) return;
    if (s.recorder.state === 'recording') {
      s.recorder.pause();
      s.pausedAt = Date.now();
      setPaused(true);
    } else if (s.recorder.state === 'paused') {
      s.recorder.resume();
      s.pausedMs += Date.now() - (s.pausedAt ?? Date.now());
      s.pausedAt = null;
      setPaused(false);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'size-9 rounded-xl transition-transform duration-200 hover:scale-105',
                  recording && 'animate-pulse text-destructive',
                )}
                aria-label={t('Видео')}
                disabled={recording}
              >
                <Video />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{t('Видео: файл или запись экрана')}</TooltipContent>
        </Tooltip>
        <PopoverContent
          side="right"
          align="start"
          className="w-72 space-y-2 p-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button variant="gradient" className="w-full justify-start" onClick={() => void start()}>
            <MonitorPlay /> {t('Записать экран')}
          </Button>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn('h-8 flex-1 rounded-lg', withMic && 'bg-accent text-primary')}
              aria-pressed={withMic}
              onClick={() => setWithMic((v) => !v)}
            >
              <Mic /> {t('Микрофон')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn('h-8 flex-1 rounded-lg', withCamera && 'bg-accent text-primary')}
              aria-pressed={withCamera}
              onClick={() => setWithCamera((v) => !v)}
            >
              <Camera /> {t('Камера')}
            </Button>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              setOpen(false);
              fileRef.current?.click();
            }}
          >
            <Upload /> {t('Загрузить видео')}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t('MP4, WebM, MOV до 300 МБ; видео можно и просто перетащить на доску')}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="video/*,.mp4,.webm,.mov,.m4v,.ogv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void onInsert(file, center());
            }}
          />
        </PopoverContent>
      </Popover>

      {recording
        ? createPortal(
            <>
              <div
                className="floating-panel fixed left-1/2 top-4 z-[60] flex -translate-x-1/2 animate-appear items-center gap-2 py-1.5 pl-3 pr-1.5"
                role="status"
              >
                <span
                  className={cn('size-2.5 rounded-full bg-destructive', !paused && 'animate-pulse')}
                  aria-hidden
                />
                <span className="text-sm font-medium tabular-nums">
                  {paused ? t('Пауза') : t('Идёт запись')} {formatDuration(elapsed)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-full"
                  aria-label={paused ? t('Продолжить') : t('Пауза')}
                  onClick={togglePause}
                >
                  {paused ? <Play /> : <Pause />}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-full"
                  onClick={() => session.current?.recorder.stop()}
                >
                  <Square /> {t('Готово')}
                </Button>
              </div>
              {camera ? <CameraBubble stream={camera} /> : null}
            </>,
            document.body,
          )
        : null}
    </>
  );
}

/** Кружок с камерой поверх страницы; его можно перетащить */
function CameraBubble({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [pos, setPos] = useState({ x: 24, y: window.innerHeight - 224 });
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div
      className="shadow-soft-lg fixed z-[60] size-48 animate-pop cursor-grab overflow-hidden rounded-full border-4 border-white active:cursor-grabbing"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => {
        const startX = e.clientX - pos.x;
        const startY = e.clientY - pos.y;
        const move = (ev: PointerEvent) =>
          setPos({ x: ev.clientX - startX, y: ev.clientY - startY });
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
    >
      <video ref={ref} autoPlay muted playsInline className="size-full -scale-x-100 object-cover" />
    </div>
  );
}

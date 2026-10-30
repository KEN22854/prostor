'use client';

import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { CallManager, CallParticipant } from '@/lib/rtc/call-manager';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/** Кнопка созвона в шапке: «Созвон» или «Присоединиться (N)» */
export function CallButton({ call }: { call: CallManager | null }) {
  const t = useT();
  const [joining, setJoining] = useState(false);
  if (!call) return null;
  const others = call.participants().filter((p) => !p.self).length;

  if (call.inCall) {
    return (
      <Button variant="destructive" size="sm" className="rounded-full" onClick={() => call.leave()}>
        <PhoneOff /> <span className="hidden sm:inline">{t('Выйти')}</span>
      </Button>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={others > 0 ? 'gradient' : 'ghost'}
          size={others > 0 ? 'sm' : 'icon'}
          className={cn('rounded-full', others > 0 && 'animate-pulse')}
          aria-label={t('Созвон на доске')}
          disabled={joining}
          onClick={async () => {
            setJoining(true);
            try {
              await call.join(false);
            } catch {
              toast.error(t('Нет доступа к микрофону — разрешите его в настройках браузера'));
            } finally {
              setJoining(false);
            }
          }}
        >
          {joining ? <Loader2 className="animate-spin" /> : <Phone />}
          {others > 0 ? <span>{t('Присоединиться ({n})', { n: others })}</span> : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {others > 0 ? t('На доске идёт созвон') : t('Созвон на доске: голос, видео, экран')}
      </TooltipContent>
    </Tooltip>
  );
}

/** Уровень громкости потока — чтобы подсветить того, кто говорит */
function useSpeaking(stream: MediaStream | null, enabled: boolean): boolean {
  const [speaking, setSpeaking] = useState(false);
  // Набор дорожек меняется (камера, экран) — пересоздаём анализатор
  const audioTracks = stream?.getAudioTracks().length ?? 0;
  useEffect(() => {
    if (!stream || !enabled || audioTracks === 0) {
      setSpeaking(false);
      return;
    }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      setSpeaking(Math.sqrt(sum / data.length) > 0.04);
    }, 150);
    return () => {
      clearInterval(timer);
      void ctx.close();
    };
  }, [stream, enabled, audioTracks]);
  return speaking;
}

function Tile({ p }: { p: CallParticipant }) {
  const t = useT();
  const ref = useRef<HTMLVideoElement>(null);
  const showVideo = (p.media.video || p.media.screen) && Boolean(p.stream);
  const speaking = useSpeaking(p.stream, p.media.audio);

  useEffect(() => {
    if (ref.current && ref.current.srcObject !== p.stream) ref.current.srcObject = p.stream;
  }, [p.stream, showVideo]);

  return (
    <div
      className={cn(
        'relative aspect-video animate-pop overflow-hidden rounded-xl bg-[hsl(266_30%_16%)] ring-2 transition-all duration-300',
        speaking ? 'shadow-glow ring-primary' : 'ring-transparent',
      )}
    >
      {/* Видео (и звук собеседника) — один элемент; своё — без звука */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={p.self}
        className={cn(
          'size-full object-cover transition-opacity duration-300',
          showVideo ? 'opacity-100' : 'opacity-0',
          p.self && !p.media.screen && '-scale-x-100',
        )}
      />
      {!showVideo ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              'flex size-12 items-center justify-center rounded-full text-lg font-semibold text-white transition-transform duration-300',
              speaking && 'scale-110',
            )}
            style={{ background: p.color }}
          >
            {p.name.slice(0, 1).toUpperCase()}
          </span>
        </div>
      ) : null}
      <div className="absolute inset-x-1.5 bottom-1.5 flex items-center gap-1 text-[11px] font-medium text-white">
        <span className="truncate rounded-md bg-black/45 px-1.5 py-0.5 backdrop-blur">
          {p.self ? t('Вы') : p.name}
          {p.media.screen ? ` · ${t('экран')}` : ''}
        </span>
        {!p.media.audio ? (
          <span className="rounded-md bg-destructive/90 p-0.5" aria-label={t('Микрофон выключен')}>
            <MicOff className="size-3" />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Плавающая панель созвона: плитки участников и кнопки микрофона, камеры, экрана */
export function CallPanel({ call }: { call: CallManager | null }) {
  const t = useT();
  const [collapsed, setCollapsed] = useState(false);
  if (!call?.inCall) return null;
  const people = call.participants();
  const media = call.localMedia;

  const control = (
    label: string,
    active: boolean,
    on: React.ReactNode,
    off: React.ReactNode,
    onClick: () => void,
  ) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'size-9 rounded-full transition-all',
            active ? 'bg-accent text-primary' : 'bg-destructive/10 text-destructive',
          )}
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
        >
          {active ? on : off}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <div
      className="floating-panel absolute right-3 top-16 z-20 w-64 animate-appear space-y-2 p-2"
      onPointerDown={(e) => e.stopPropagation()}
      data-testid="call-panel"
    >
      <div className="flex items-center justify-between px-1">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <span className="size-2 animate-pulse rounded-full bg-green-500" aria-hidden />
          {t('Созвон')} · {people.length}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={collapsed ? t('Развернуть') : t('Свернуть')}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? <ChevronDown /> : <ChevronUp />}
        </Button>
      </div>
      {collapsed ? null : (
        <div className="grid max-h-[50vh] gap-2 overflow-y-auto">
          {people.map((p) => (
            <Tile key={p.clientId} p={p} />
          ))}
        </div>
      )}
      <div className="flex items-center justify-center gap-1.5">
        {control(
          media.audio ? t('Выключить микрофон') : t('Включить микрофон'),
          media.audio,
          <Mic />,
          <MicOff />,
          () => call.setAudio(!media.audio),
        )}
        {control(
          media.video ? t('Выключить камеру') : t('Включить камеру'),
          media.video,
          <Video />,
          <VideoOff />,
          () => void call.setVideo(!media.video).catch(() => toast.error(t('Камера недоступна'))),
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'size-9 rounded-full',
                media.screen && 'bg-primary text-primary-foreground',
              )}
              aria-label={t('Показать экран')}
              aria-pressed={media.screen}
              onClick={() => void call.toggleScreen().catch(() => undefined)}
            >
              <MonitorUp />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {media.screen ? t('Остановить показ экрана') : t('Показать экран')}
          </TooltipContent>
        </Tooltip>
        <Button
          variant="destructive"
          size="icon"
          className="size-9 rounded-full"
          aria-label={t('Выйти из созвона')}
          onClick={() => call.leave()}
        >
          <PhoneOff />
        </Button>
      </div>
    </div>
  );
}

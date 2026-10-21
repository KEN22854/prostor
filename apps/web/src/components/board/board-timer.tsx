'use client';

import { Pause, Play, Plus, Square, Timer } from 'lucide-react';
import { useState } from 'react';
import type * as Y from 'yjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useBoardTimer } from '@/hooks/use-board-timer';
import { addTime, formatClock, pauseTimer, resumeTimer, startTimer, stopTimer } from '@/lib/board-timer';
import { cn } from '@/lib/utils';

const PRESETS = [1, 3, 5, 10, 15];

interface BoardTimerControlProps {
  doc: Y.Doc | null;
  /** Запускать и останавливать могут редакторы; остальные видят отсчёт */
  canControl: boolean;
  userName: string;
}

/** Таймер ведущего в шапке доски: отсчёт виден всем участникам */
export function BoardTimerControl({ doc, canControl, userName }: BoardTimerControlProps) {
  const { timer, left } = useBoardTimer(doc);
  const [custom, setCustom] = useState('');
  const [open, setOpen] = useState(false);
  if (!doc || (!timer && !canControl)) return null;

  const finished = timer?.status === 'running' && left === 0;
  const urgent = timer?.status === 'running' && left > 0 && left <= 10_000;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {timer ? (
          <Button
            variant="outline"
            size="sm"
            className={cn('h-8 gap-1.5 font-mono tabular-nums', (finished || urgent) && 'border-destructive text-destructive', finished && 'animate-pulse')}
            aria-label={`Таймер: ${formatClock(left)}${timer.status === 'paused' ? ', на паузе' : ''}`}
            data-testid="board-timer"
          >
            <Timer className="size-4" />
            {formatClock(left)}
            {timer.status === 'paused' ? <Pause className="size-3" /> : null}
          </Button>
        ) : (
          <Button variant="ghost" size="icon" aria-label="Таймер">
            <Timer />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        {timer ? (
          <>
            <p className="text-center font-mono text-3xl tabular-nums">{formatClock(left)}</p>
            {timer.startedByName ? <p className="text-center text-xs text-muted-foreground">Запустил(а) {timer.startedByName}</p> : null}
            {canControl ? (
              <div className="flex justify-center gap-1">
                {timer.status === 'running' ? (
                  <Button size="sm" variant="outline" onClick={() => pauseTimer(doc)} disabled={finished}>
                    <Pause /> Пауза
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => resumeTimer(doc)}>
                    <Play /> Дальше
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => addTime(doc, 60_000)} aria-label="Добавить минуту">
                  <Plus /> 1 мин
                </Button>
                <Button size="sm" variant="outline" onClick={() => stopTimer(doc)} aria-label="Остановить таймер">
                  <Square />
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-sm font-medium">Таймер для всех участников</p>
            <div className="grid grid-cols-5 gap-1">
              {PRESETS.map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    startTimer(doc, m * 60_000, userName);
                    setOpen(false);
                  }}
                >
                  {m}
                </Button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const minutes = Number(custom.replace(',', '.'));
                if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 180) return;
                startTimer(doc, Math.round(minutes * 60_000), userName);
                setCustom('');
                setOpen(false);
              }}
            >
              <Input
                aria-label="Минут"
                placeholder="Минут"
                inputMode="decimal"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <Button type="submit" size="sm">
                <Play /> Старт
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">Пресеты — минуты</p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

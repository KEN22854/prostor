'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { Y_KEYS } from '@prostor/shared';
import { readTimer, remainingMs, type BoardTimer } from '@/lib/board-timer';

/** Короткий сигнал окончания (WebAudio, без файлов) */
function beep(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
    osc.onended = () => void ctx.close();
  } catch {
    // Звук недоступен (нет взаимодействия со страницей) — достаточно уведомления
  }
}

/** Таймер доски: состояние из Yjs и оставшееся время с тиком 4 раза в секунду */
export function useBoardTimer(doc: Y.Doc | null): { timer: BoardTimer | null; left: number } {
  const [timer, setTimer] = useState<BoardTimer | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const finishedRun = useRef<string | null>(null);

  useEffect(() => {
    if (!doc) return;
    const meta = doc.getMap<unknown>(Y_KEYS.meta);
    const update = () => setTimer(readTimer(doc));
    update();
    meta.observe(update);
    return () => meta.unobserve(update);
  }, [doc]);

  useEffect(() => {
    if (timer?.status !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer?.status, timer?.runId]);

  const left = timer ? remainingMs(timer, now) : 0;

  useEffect(() => {
    if (!timer || timer.status !== 'running' || left > 0 || finishedRun.current === timer.runId) return;
    finishedRun.current = timer.runId;
    // Доска открыта уже после окончания — сигнал не нужен
    if (timer.endsAt && Date.now() - timer.endsAt < 5_000) {
      beep();
      toast.info('Время вышло', { description: timer.startedByName ? `Таймер запустил(а) ${timer.startedByName}` : undefined });
    }
  }, [timer, left]);

  return { timer, left };
}

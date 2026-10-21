'use client';

import {
  ArrowLeft,
  ArrowRight,
  CornerDownRight,
  Minus,
  Spline,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LineElement, LineRouting } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { BoardActions } from '@/lib/canvas/board-actions';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';

const ROUTINGS: ReadonlyArray<{ value: LineRouting; label: string; icon: LucideIcon }> = [
  { value: 'straight', label: 'Прямая', icon: Minus },
  { value: 'elbow', label: 'Ломаная', icon: CornerDownRight },
  { value: 'curved', label: 'Кривая', icon: Spline },
];

function Toggle({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={active}
          className={cn('size-8', active && 'bg-accent text-accent-foreground')}
          onClick={onClick}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Свойства линий и стрелок в панели выделения: маршрут, наконечники и
 * подпись (для одной линии). Подпись пишется в Yjs по Enter/blur — как
 * название фрейма, чтобы не плодить шаг отмены на каждую букву.
 */
export function LineControls({ lines, actions }: { lines: LineElement[]; actions: BoardActions }) {
  const t = useT();
  const ids = lines.map((l) => l.id);
  const first = lines[0];
  if (!first) return null;
  const routing = first.routing ?? 'straight';
  const startOn = first.startArrow === 'arrow';
  const endOn = first.endArrow !== 'none';
  const patchAll = (patch: Record<string, unknown>) =>
    actions.update(new Map(ids.map((id) => [id, patch])));

  return (
    <>
      {ROUTINGS.map((r) => (
        <Toggle
          key={r.value}
          active={routing === r.value}
          label={t(r.label)}
          icon={r.icon}
          onClick={() => patchAll({ routing: r.value })}
        />
      ))}
      <Toggle
        active={startOn}
        label={t('Наконечник в начале')}
        icon={ArrowLeft}
        onClick={() => patchAll({ startArrow: startOn ? 'none' : 'arrow' })}
      />
      <Toggle
        active={endOn}
        label={t('Наконечник в конце')}
        icon={ArrowRight}
        onClick={() => patchAll({ endArrow: endOn ? 'none' : 'arrow' })}
      />
      {lines.length === 1 ? <LineLabelInput key={first.id} line={first} actions={actions} /> : null}
    </>
  );
}

function LineLabelInput({ line, actions }: { line: LineElement; actions: BoardActions }) {
  const t = useT();
  const [value, setValue] = useState(line.label ?? '');
  useEffect(() => setValue(line.label ?? ''), [line.label]);

  const commit = () => {
    const label = value.trim().slice(0, 500);
    if (label !== (line.label ?? '')) {
      actions.update(new Map([[line.id, { label: label || undefined }]]));
    }
  };

  return (
    <Input
      aria-label={t('Подпись линии')}
      placeholder={t('Подпись')}
      value={value}
      maxLength={500}
      className="ml-1 h-8 w-36"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValue(line.label ?? '');
          e.currentTarget.blur();
        }
        e.stopPropagation();
      }}
    />
  );
}

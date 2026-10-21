'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ColorSwatchesProps {
  colors: readonly string[];
  value: string | null;
  onChange: (color: string) => void;
  label: string;
}

/** Палитра цветов (прозрачный — шахматка) */
export function ColorSwatches({ colors, value, onChange, label }: ColorSwatchesProps) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {colors.map((color) => {
        const selected = value?.toLowerCase() === color.toLowerCase();
        const transparent = color === 'transparent';
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={transparent ? 'Без заливки' : color}
            onClick={() => onChange(color)}
            className={cn(
              'flex size-6 items-center justify-center rounded-full border border-black/10 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
            )}
            style={
              transparent
                ? {
                    backgroundImage:
                      'linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,#fff 25%,#fff 75%,#ccc 75%)',
                    backgroundSize: '8px 8px',
                    backgroundPosition: '0 0,4px 4px',
                  }
                : { backgroundColor: color }
            }
          >
            {selected ? (
              <Check
                className={cn(
                  'size-3.5',
                  color === '#ffffff' || transparent
                    ? 'text-black'
                    : 'text-white mix-blend-difference',
                )}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

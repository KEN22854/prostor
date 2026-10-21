'use client';

import { useEffect, useState } from 'react';
import type { FrameElement } from '@prostor/shared';
import { Input } from '@/components/ui/input';
import type { BoardActions } from '@/lib/canvas/board-actions';

/**
 * Название фрейма в панели свойств. Пишем в Yjs по Enter/blur, а не на каждый
 * символ: иначе у коллег заголовок «печатался» бы по букве и каждая буква
 * становилась отдельным шагом отмены.
 */
export function FrameTitleInput({ frame, actions }: { frame: FrameElement; actions: BoardActions }) {
  const [value, setValue] = useState(frame.title);
  // Коллега переименовал фрейм, пока поле не в фокусе, — показываем новое название
  useEffect(() => setValue(frame.title), [frame.title]);

  const commit = () => {
    const title = value.trim().slice(0, 200) || frame.title;
    setValue(title);
    if (title !== frame.title) actions.update(new Map([[frame.id, { title }]]));
  };

  return (
    <Input
      aria-label="Название фрейма"
      value={value}
      maxLength={200}
      className="h-8 w-44"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValue(frame.title);
          e.currentTarget.blur();
        }
        // Delete/Backspace внутри поля не должны удалять выделенный фрейм
        e.stopPropagation();
      }}
    />
  );
}

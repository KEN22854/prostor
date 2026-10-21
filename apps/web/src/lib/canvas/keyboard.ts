/**
 * Горячие клавиши холста не должны срабатывать, когда пользователь печатает:
 * в input/textarea, contenteditable (rich-text) или внутри диалога.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes(type);
  }
  return Boolean(target.closest('[role="dialog"]'));
}

/**
 * Событие пришло с самого холста (Konva-canvas или контейнер), а не с панелей
 * поверх него. Нативные слушатели контейнера срабатывают раньше React-обработчиков
 * панелей, поэтому stopPropagation в React не спасает: без этой проверки клик по
 * кнопке начинал рамку выделения и захватывал указатель — кнопка не получала click.
 */
export function isCanvasTarget(e: Event, container: HTMLElement): boolean {
  return e.target === container || e.target instanceof HTMLCanvasElement;
}

/** Ctrl на Windows/Linux, Cmd на macOS */
export function isModKey(e: KeyboardEvent | WheelEvent | PointerEvent): boolean {
  return e.ctrlKey || e.metaKey;
}

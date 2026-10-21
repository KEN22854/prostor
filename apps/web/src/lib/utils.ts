import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Русская плюрализация: plural(5, ['объект', 'объекта', 'объектов']) → 'объектов' */
export function plural(
  n: number,
  forms: readonly [one: string, few: string, many: string],
): string {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** Сообщение об ошибке для toast из unknown (catch-блоки) */
export function errorMessage(error: unknown, fallback = 'Что-то пошло не так'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

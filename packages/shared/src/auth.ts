import { z } from 'zod';

/** Схемы форм авторизации — общие для react-hook-form и API-роутов. */

export const emailSchema = z.string().trim().toLowerCase().email('Некорректный email').max(254);

export const passwordSchema = z
  .string()
  .min(8, 'Минимум 8 символов')
  .max(128, 'Максимум 128 символов')
  // bcrypt учитывает только первые 72 байта — длинный кириллический пароль
  // (2 байта на символ) может «обрезаться» молча, поэтому ограничиваем байты.
  .refine(
    (v) => new TextEncoder().encode(v).length <= 72,
    'Пароль слишком длинный (лимит 72 байта)',
  )
  .refine((v) => /[A-Za-zА-Яа-яЁё]/.test(v) && /\d/.test(v), 'Нужны буквы и цифры');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Введите пароль').max(128),
  /** Второй фактор: 6 цифр из приложения или резервный код xxxx-xxxx */
  totp: z.string().trim().max(20).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Введите имя').max(120),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(32).max(256),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'Введите имя').max(120),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** currentPassword не нужен, если пароля ещё нет (вход только через OAuth) */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().max(128).optional(),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

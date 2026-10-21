import { CredentialsSignin } from 'next-auth';

/**
 * Ошибки входа по паролю. Auth.js передаёт `code` клиенту
 * (signIn(...).code), поэтому формы показывают точную причину.
 * Сообщения для пользователя — в lib/auth/messages.ts.
 */
export class InvalidCredentialsError extends CredentialsSignin {
  override code = 'invalid_credentials';
}

export class RateLimitedError extends CredentialsSignin {
  override code = 'rate_limited';
}

export class AccountDisabledError extends CredentialsSignin {
  override code = 'account_disabled';
}

/** Пароль верный, нужен код второго фактора — форма покажет поле кода */
export class TwoFactorRequiredError extends CredentialsSignin {
  override code = 'two_factor_required';
}

export class InvalidTwoFactorError extends CredentialsSignin {
  override code = 'invalid_2fa';
}

/** База данных недоступна (не запущен Postgres) — не «неверный пароль» и не «ошибка конфигурации» */
export class ServiceUnavailableError extends CredentialsSignin {
  override code = 'service_unavailable';
}

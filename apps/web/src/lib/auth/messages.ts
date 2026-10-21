/**
 * Человекочитаемые сообщения для кодов ошибок Auth.js
 * (?error=... в URL после OAuth и signIn(...).code для пароля).
 */
const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Неверный email или пароль',
  rate_limited: 'Слишком много попыток. Попробуйте через несколько минут',
  account_disabled: 'Учётная запись заблокирована. Обратитесь к администратору',
  two_factor_required: 'Введите код из приложения-аутентификатора',
  invalid_2fa: 'Неверный код. Попробуйте ещё раз или используйте резервный код',
  CredentialsSignin: 'Неверный email или пароль',
  OAuthAccountNotLinked:
    'Этот email уже зарегистрирован другим способом. Войдите так, как входили раньше',
  OAuthCallbackError: 'Провайдер вернул ошибку. Попробуйте ещё раз',
  OAuthSignin: 'Не удалось начать вход через провайдера',
  AccessDenied: 'Доступ запрещён',
  SignupDisabled: 'Регистрация закрыта. Попросите приглашение у администратора',
  Configuration: 'Ошибка конфигурации входа. Сообщите администратору',
  Verification: 'Ссылка устарела или уже использована',
};

export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? 'Не удалось войти. Попробуйте ещё раз';
}

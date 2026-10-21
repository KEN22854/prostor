/**
 * Действия аудит-лога. В БД — строка (AuditLog.action), здесь — источник правды.
 */
export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.login_failed',
  'auth.logout',
  'auth.password_reset',
  'auth.password_change',
  'auth.logout_all',
  'account.update',
  'auth.2fa_enabled',
  'auth.2fa_disabled',
  'board.create',
  'board.update',
  'board.delete',
  'board.restore',
  'board.duplicate',
  'board.export',
  'board.visibility_change',
  'board.version_create',
  'board.version_restore',
  'member.add',
  'member.role_change',
  'member.remove',
  'invite.create',
  'invite.accept',
  'invite.revoke',
  'folder.create',
  'folder.move',
  'folder.delete',
  'org.create',
  'org.update',
  'org.policy_change',
  'org.member_role_change',
  'folder.update',
  'folder.member_add',
  'folder.member_remove',
  'board.move',
  'element.delete_blocked',
  'org.member_add',
  'org.member_remove',
  'ai.job_create',
  'api_key.create',
  'api_key.revoke',
  'webhook.create',
  'webhook.delete',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Человекочитаемые названия действий для журнала */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'auth.login': 'Вход',
  'auth.login_failed': 'Неудачный вход',
  'auth.logout': 'Выход',
  'auth.password_reset': 'Сброс пароля',
  'auth.password_change': 'Смена пароля',
  'auth.logout_all': 'Выход на всех устройствах',
  'account.update': 'Изменение профиля',
  'auth.2fa_enabled': 'Включена 2FA',
  'auth.2fa_disabled': 'Отключена 2FA',
  'board.create': 'Создана доска',
  'board.update': 'Изменена доска',
  'board.delete': 'Удалена доска',
  'board.restore': 'Доска восстановлена из корзины',
  'board.duplicate': 'Копия доски',
  'board.export': 'Экспорт',
  'board.visibility_change': 'Изменена видимость',
  'board.version_create': 'Сохранена версия',
  'board.version_restore': 'Восстановлена версия',
  'member.add': 'Добавлен участник доски',
  'member.role_change': 'Изменена роль на доске',
  'member.remove': 'Удалён участник доски',
  'invite.create': 'Создано приглашение',
  'invite.accept': 'Принято приглашение',
  'invite.revoke': 'Отозвано приглашение',
  'folder.create': 'Создана папка',
  'folder.move': 'Перемещена папка',
  'folder.delete': 'Удалена папка',
  'folder.update': 'Изменена папка',
  'folder.member_add': 'Открыт доступ к папке',
  'folder.member_remove': 'Закрыт доступ к папке',
  'org.create': 'Создана организация',
  'org.update': 'Изменена организация',
  'org.policy_change': 'Изменены политики',
  'org.member_add': 'Добавлен участник организации',
  'org.member_remove': 'Удалён участник организации',
  'org.member_role_change': 'Изменена роль в организации',
  'board.move': 'Доска перемещена',
  'element.delete_blocked': 'Заблокировано удаление чужих объектов',
  'ai.job_create': 'ИИ-задача',
  'api_key.create': 'Создан API-ключ',
  'api_key.revoke': 'Отозван API-ключ',
  'webhook.create': 'Создан вебхук',
  'webhook.delete': 'Удалён вебхук',
};

export interface AuditEntryDto {
  id: string;
  createdAt: string;
  action: string;
  actionLabel: string;
  actorName: string | null;
  actorEmail: string | null;
  boardId: string | null;
  boardTitle: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
}

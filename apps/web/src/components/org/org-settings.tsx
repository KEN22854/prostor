'use client';

import { Loader2, ShieldCheck, ShieldOff, UserMinus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  ORG_ROLE_LABELS,
  type OrgDetailsDto,
  type OrgPolicyUpdate,
  type OrgRole,
} from '@prostor/shared';
import { AuditLogView } from '@/components/audit/audit-log-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';

const POLICIES: Array<{
  key: keyof Omit<OrgPolicyUpdate, 'allowedEmailDomains' | 'require2fa'>;
  title: string;
  hint: string;
}> = [
  {
    key: 'allowExport',
    title: 'Экспорт досок',
    hint: 'PNG, PDF и SVG. Владелец доски может экспортировать всегда',
  },
  {
    key: 'allowCopy',
    title: 'Копирование',
    hint: 'Копирование объектов в буфер и дублирование досок',
  },
  {
    key: 'allowDeleteOthers',
    title: 'Удаление чужих объектов',
    hint: 'Иначе редакторы удаляют только созданное собой — проверяет и сервер',
  },
  {
    key: 'allowPublicBoards',
    title: 'Публичные доски',
    hint: 'Доступ по ссылке без входа. Отключение сразу закрывает существующие ссылки',
  },
  {
    key: 'guestCanVote',
    title: 'Гости голосуют',
    hint: 'Участники с ролью «Гость» могут голосовать',
  },
  { key: 'guestCanUseTimer', title: 'Гости управляют таймером', hint: '' },
];

/** Настройки организации: общие, участники, политики, безопасность, журнал */
export function OrgSettings({ org }: { org: OrgDetailsDto }) {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState(org.name);
  const [policies, setPolicies] = useState<OrgPolicyUpdate>({
    allowExport: org.allowExport,
    allowCopy: org.allowCopy,
    allowDeleteOthers: org.allowDeleteOthers,
    allowPublicBoards: org.allowPublicBoards,
    guestCanVote: org.guestCanVote,
    guestCanUseTimer: org.guestCanUseTimer,
    require2fa: org.require2fa,
    allowedEmailDomains: org.allowedEmailDomains,
  });
  const [domains, setDomains] = useState(org.allowedEmailDomains.join('\n'));
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('MEMBER');
  const [busy, setBusy] = useState(false);

  async function save(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      await apiRequest(`/api/orgs/${org.id}`, { method: 'PATCH', body });
      toast.success(done);
      router.refresh();
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось сохранить')));
    } finally {
      setBusy(false);
    }
  }

  async function member(
    method: 'POST' | 'PATCH' | 'DELETE',
    userId: string | null,
    body?: unknown,
  ) {
    try {
      await apiRequest(`/api/orgs/${org.id}/members${userId ? `/${userId}` : ''}`, {
        method,
        body,
      });
      if (method === 'DELETE' && userId && org.members.find((m) => m.userId === userId)?.isYou) {
        router.push('/dashboard');
        return;
      }
      router.refresh();
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось выполнить действие')));
    }
  }

  const without2fa = org.members.filter((m) => !m.twoFactorEnabled).length;

  return (
    <Tabs defaultValue={org.canManage ? 'members' : 'general'}>
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="general">{t('Общие')}</TabsTrigger>
        <TabsTrigger value="members">Участники {org.memberCount}</TabsTrigger>
        {org.canManage ? <TabsTrigger value="policies">{t('Политики')}</TabsTrigger> : null}
        {org.canManage ? <TabsTrigger value="security">{t('Безопасность')}</TabsTrigger> : null}
        {org.canManage ? <TabsTrigger value="audit">{t('Журнал')}</TabsTrigger> : null}
      </TabsList>

      <TabsContent value="general" className="space-y-4">
        <form
          className="flex max-w-md items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save({ name }, 'Название сохранено');
          }}
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="org-name">{t('Название')}</Label>
            <Input
              id="org-name"
              value={name}
              disabled={!org.canManage}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {org.canManage ? (
            <Button type="submit" disabled={busy || name.trim() === org.name}>
              {t('Сохранить')}
            </Button>
          ) : null}
        </form>
        <p className="text-sm text-muted-foreground">
          Ваша роль: {ORG_ROLE_LABELS[org.role]} · досок: {org.boardCount}
        </p>
        <Button
          variant="outline"
          onClick={() => void member('DELETE', org.members.find((m) => m.isYou)?.userId ?? null)}
        >
          {t('Покинуть организацию')}
        </Button>
      </TabsContent>

      <TabsContent value="members" className="space-y-3">
        {org.canManage ? (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.trim()) return;
              void member('POST', null, { email: email.trim(), role }).then(() => setEmail(''));
            }}
          >
            <Input
              type="email"
              className="min-w-56 flex-1"
              placeholder={t('email зарегистрированного пользователя')}
              aria-label={t('Email участника')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="w-44">
              <NativeSelect
                aria-label={t('Роль в организации')}
                value={role}
                onChange={(e) => setRole(e.target.value as OrgRole)}
              >
                <option value="MEMBER">{ORG_ROLE_LABELS.MEMBER}</option>
                <option value="ADMIN">{ORG_ROLE_LABELS.ADMIN}</option>
                {org.isOwner ? <option value="OWNER">{ORG_ROLE_LABELS.OWNER}</option> : null}
              </NativeSelect>
            </div>
            <Button type="submit">{t('Добавить')}</Button>
          </form>
        ) : null}
        <ul className="divide-y rounded-lg border" aria-label={t('Участники организации')}>
          {org.members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center gap-3 p-2.5 text-sm"
              data-testid="org-member"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {m.name ?? m.email}{' '}
                  {m.isYou ? <span className="text-muted-foreground">{t('(вы)')}</span> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              <span title={m.twoFactorEnabled ? t('2FA включена') : t('2FA не включена')}>
                {m.twoFactorEnabled ? (
                  <ShieldCheck className="size-4 text-green-600" />
                ) : (
                  <ShieldOff className="size-4 text-muted-foreground" />
                )}
              </span>
              {org.canManage && !m.isYou && (m.role !== 'OWNER' || org.isOwner) ? (
                <>
                  <div className="w-40">
                    <NativeSelect
                      aria-label={`Роль ${m.email}`}
                      value={m.role}
                      onChange={(e) => void member('PATCH', m.userId, { role: e.target.value })}
                    >
                      <option value="MEMBER">{ORG_ROLE_LABELS.MEMBER}</option>
                      <option value="ADMIN">{ORG_ROLE_LABELS.ADMIN}</option>
                      {org.isOwner ? <option value="OWNER">{ORG_ROLE_LABELS.OWNER}</option> : null}
                    </NativeSelect>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Удалить ${m.email}`}
                    onClick={() => void member('DELETE', m.userId)}
                  >
                    <UserMinus />
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{ORG_ROLE_LABELS[m.role]}</span>
              )}
            </li>
          ))}
        </ul>
      </TabsContent>

      {org.canManage ? (
        <TabsContent value="policies" className="space-y-3">
          {POLICIES.map((p) => (
            <label
              key={p.key}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"
            >
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={policies[p.key]}
                onChange={(e) => setPolicies({ ...policies, [p.key]: e.target.checked })}
              />
              <span>
                <span className="block font-medium">{p.title}</span>
                {p.hint ? <span className="block text-muted-foreground">{p.hint}</span> : null}
              </span>
            </label>
          ))}
          <Button
            disabled={busy}
            onClick={() => {
              const { allowedEmailDomains: _d, require2fa: _r, ...rest } = policies;
              void save(rest, 'Политики сохранены и уже действуют на открытых досках');
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {t('Сохранить политики')}
          </Button>
        </TabsContent>
      ) : null}

      {org.canManage ? (
        <TabsContent value="security" className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={policies.require2fa}
              onChange={(e) => setPolicies({ ...policies, require2fa: e.target.checked })}
            />
            <span>
              <span className="block font-medium">
                {t('Обязательная двухфакторная аутентификация')}
              </span>
              <span className="block text-muted-foreground">
                Без 2FA участник не откроет доски организации. Сейчас без 2FA: {without2fa}
              </span>
            </span>
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="org-domains">{t('Автоприсоединение по домену почты')}</Label>
            <Textarea
              id="org-domains"
              rows={3}
              placeholder={'company.ru\ncompany.com'}
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'По одному домену в строке. Новые пользователи с такой почтой сразу становятся участниками.',
              )}
            </p>
          </div>
          <Button
            disabled={busy}
            onClick={() =>
              void save(
                {
                  require2fa: policies.require2fa,
                  allowedEmailDomains: domains
                    .split(/[\s,;]+/)
                    .map((d) => d.trim().replace(/^@/, ''))
                    .filter(Boolean),
                },
                'Настройки безопасности сохранены',
              )
            }
          >
            {t('Сохранить')}
          </Button>
        </TabsContent>
      ) : null}

      {org.canManage ? (
        <TabsContent value="audit">
          <AuditLogView endpoint={`/api/orgs/${org.id}/audit`} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

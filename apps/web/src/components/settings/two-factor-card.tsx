'use client';

import { Copy, Loader2, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { copyText } from '@/lib/copy-text';
import { ApiClientError, apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';

interface Setup {
  secret: string;
  otpauthUrl: string;
  qrSvg: string;
}

interface TwoFactorCardProps {
  enabled: boolean;
  backupCodesLeft: number;
}

/** Включение / отключение 2FA: QR → код из приложения → резервные коды (показываются один раз) */
export function TwoFactorCard({ enabled, backupCodesLeft }: TwoFactorCardProps) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);
  const [disabling, setDisabling] = useState(false);

  async function call<T>(body: Record<string, unknown>): Promise<T | null> {
    setPending(true);
    try {
      return await apiRequest<T>('/api/account/2fa', { method: 'POST', body });
    } catch (e: unknown) {
      toast.error(
        e instanceof ApiClientError && e.fields.code
          ? e.fields.code
          : errorMessage(e, 'Не удалось выполнить действие'),
      );
      return null;
    } finally {
      setPending(false);
    }
  }

  if (codes) {
    return (
      <div className="space-y-3" data-testid="backup-codes">
        <p className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
          <ShieldCheck className="size-4" /> Двухфакторная аутентификация включена
        </p>
        <p className="text-sm text-muted-foreground">
          Сохраните резервные коды — они понадобятся, если телефон потеряется. Каждый код
          одноразовый, больше они не будут показаны.
        </p>
        <ul className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-3 font-mono text-sm">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() =>
              void copyText(codes.join('\n')).then((ok) => ok && toast.success('Скопировано'))
            }
          >
            <Copy /> Скопировать
          </Button>
          <Button
            onClick={() => {
              setCodes(null);
              router.refresh();
            }}
          >
            Я сохранил(а) коды
          </Button>
        </div>
      </div>
    );
  }

  if (enabled) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
          <ShieldCheck className="size-4" /> Включена · резервных кодов осталось: {backupCodesLeft}
        </p>
        {disabling ? (
          <form
            className="flex max-w-sm gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void call<{ ok: true }>({ action: 'disable', code }).then((r) => {
                if (!r) return;
                toast.success('Двухфакторная аутентификация отключена');
                setDisabling(false);
                setCode('');
                router.refresh();
              });
            }}
          >
            <Input
              aria-label="Код для отключения"
              placeholder="Код или резервный код"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
            />
            <Button
              type="submit"
              variant="destructive"
              disabled={pending || code.trim().length < 6}
            >
              Отключить
            </Button>
          </form>
        ) : (
          <Button variant="outline" onClick={() => setDisabling(true)}>
            Отключить 2FA
          </Button>
        )}
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          При входе по паролю понадобится ещё код из приложения-аутентификатора (Яндекс Ключ, Google
          Authenticator, 1Password…).
        </p>
        <Button
          disabled={pending}
          onClick={() => void call<Setup>({ action: 'setup' }).then((s) => s && setSetup(s))}
        >
          {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          Включить 2FA
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">1. Отсканируйте QR-код в приложении-аутентификаторе:</p>
      <div className="flex flex-wrap items-center gap-4">
        {/* SVG сгенерирован на нашем сервере из otpauth-URL — не пользовательский ввод */}
        <div
          className="rounded-lg border bg-white p-2"
          aria-label="QR-код для приложения"
          dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
        />
        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground">или введите ключ вручную:</p>
          <code
            className="block break-all rounded bg-muted px-2 py-1 font-mono text-xs"
            data-testid="totp-secret"
          >
            {setup.secret}
          </code>
        </div>
      </div>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void call<{ backupCodes: string[] }>({ action: 'enable', code }).then((r) => {
            if (!r) return;
            setCodes(r.backupCodes);
            setSetup(null);
            setCode('');
          });
        }}
      >
        <Label htmlFor="totp-confirm">2. Введите код из приложения</Label>
        <div className="flex max-w-xs gap-2">
          <Input
            id="totp-confirm"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button type="submit" disabled={pending || code.trim().length !== 6}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Подтвердить
          </Button>
        </div>
      </form>
    </div>
  );
}

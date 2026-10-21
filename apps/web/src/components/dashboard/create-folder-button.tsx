'use client';

import { FolderPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';

interface CreateFolderButtonProps {
  orgId: string | null;
  /** Создать внутри текущей папки */
  parentId: string | null;
}

/** Новая папка: в корне рабочего пространства или внутри открытой папки */
export function CreateFolderButton({ orgId, parentId }: CreateFolderButtonProps) {
  const t = useT();
  const router = useRouter();
  const [dialog, ask] = usePrompt();

  async function create() {
    const name = await ask({
      title: parentId ? 'Новая вложенная папка' : 'Новая папка',
      label: 'Название папки',
      confirmLabel: 'Создать',
    });
    if (!name) return;
    try {
      await apiRequest('/api/folders', {
        method: 'POST',
        body: { name, parentId, orgId: parentId ? null : orgId },
      });
      router.refresh();
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось создать папку')));
    }
  }

  return (
    <>
      {dialog}
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={parentId ? t('Новая вложенная папка') : t('Новая папка')}
        title={parentId ? t('Новая вложенная папка') : t('Новая папка')}
        onClick={() => void create()}
      >
        <FolderPlus className="size-4" />
      </Button>
    </>
  );
}

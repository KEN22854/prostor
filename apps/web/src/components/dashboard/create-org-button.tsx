'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';

/** Создать организацию — пространство команды с общими досками, папками и политиками */
export function CreateOrgButton() {
  const router = useRouter();
  const [dialog, ask] = usePrompt();

  async function create() {
    const name = await ask({
      title: 'Новая организация',
      description: 'Общие доски, папки и политики для команды. Вы станете владельцем.',
      label: 'Название организации или команды',
      confirmLabel: 'Создать',
    });
    if (!name) return;
    try {
      const org = await apiRequest<{ id: string }>('/api/orgs', { method: 'POST', body: { name } });
      toast.success('Организация создана');
      router.push(`/dashboard?org=${org.id}`);
      router.refresh();
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Не удалось создать организацию'));
    }
  }

  return (
    <>
      {dialog}
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Новая организация"
        title="Новая организация"
        onClick={() => void create()}
      >
        <Plus className="size-4" />
      </Button>
    </>
  );
}

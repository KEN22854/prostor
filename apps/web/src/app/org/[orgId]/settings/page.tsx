import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { OrgSettings } from '@/components/org/org-settings';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { getSessionUser } from '@/lib/session';
import { getOrg } from '@/services/orgs';

export const metadata: Metadata = { title: 'Настройки организации', robots: { index: false } };

interface OrgSettingsPageProps {
  params: Promise<{ orgId: string }>;
}

export default async function OrgSettingsPage({ params }: OrgSettingsPageProps) {
  const { orgId } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(`/org/${orgId}/settings`)}`);
  const org = await getOrg(orgId, user).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  });
  if (!org) notFound();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex h-14 items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="К доскам организации">
            <Link href={`/dashboard?org=${org.id}`}>
              <ArrowLeft />
            </Link>
          </Button>
          <h1 className="min-w-0 truncate font-semibold">{org.name} · настройки</h1>
        </div>
      </header>
      <main className="container max-w-4xl py-8">
        <OrgSettings org={org} />
      </main>
    </div>
  );
}

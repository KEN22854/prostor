import { withErrorHandling } from '@/lib/api';
import { auditQuery, auditResponse } from '@/lib/audit-route';
import { requireUser } from '@/lib/session';
import { orgAudit } from '@/services/audit-log';

/** GET /api/orgs/:id/audit — журнал организации (администраторам); ?format=csv — выгрузка */
export const GET = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ orgId: string }> }) => {
    const { orgId } = await params;
    const user = await requireUser();
    const { query, csv } = auditQuery(req);
    return auditResponse(await orgAudit(user, orgId, query, csv), csv, `audit-org-${orgId}`);
  },
);

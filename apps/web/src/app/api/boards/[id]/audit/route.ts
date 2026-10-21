import { withErrorHandling } from '@/lib/api';
import { auditQuery, auditResponse } from '@/lib/audit-route';
import { requireUser } from '@/lib/session';
import { boardAudit } from '@/services/audit-log';

/** GET /api/boards/:id/audit — журнал доски (владельцу); ?format=csv — выгрузка */
export const GET = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireUser();
    const { query, csv } = auditQuery(req);
    return auditResponse(await boardAudit(user, id, query, csv), csv, `audit-board-${id}`);
  },
);

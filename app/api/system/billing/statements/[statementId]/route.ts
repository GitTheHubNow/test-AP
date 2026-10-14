/**
 * PATCH /api/system/billing/statements/[statementId]   (platform admin only)
 *
 * Body: { action: 'mark_paid', paymentReference? } | { action: 'void' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/billing/routeHelpers';
import { markStatementPaid, voidStatement, toStatementDTO } from '@/lib/billing/statements';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ statementId: string }> }) {
  const { statementId } = await params;

  return withPlatformAdmin('PATCH /api/system/billing/statements/[id]', async () => {
    const body = (await req.json().catch(() => ({}))) as { action?: unknown; paymentReference?: unknown };

    let result;
    if (body.action === 'mark_paid') {
      const ref = typeof body.paymentReference === 'string' ? body.paymentReference.slice(0, 200) : undefined;
      result = await markStatementPaid(statementId, ref);
    } else if (body.action === 'void') {
      result = await voidStatement(statementId);
    } else {
      return NextResponse.json({ success: false, error: "action must be 'mark_paid' or 'void'" }, { status: 400 });
    }

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.code === 'NOT_FOUND' ? 404 : 409 });
    }
    return NextResponse.json({ success: true, data: { statement: toStatementDTO(result.statement) } });
  });
}

/**
 * POST /api/system/billing/statements/[statementId]/send   (platform admin only)
 *
 * Emails the statement to the site (its billingEmail, else its owners) and
 * marks it SENT. Body: { resend?: boolean } — required to re-send one that
 * was already sent. The statement is only marked SENT if the email really
 * went out.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/billing/routeHelpers';
import { sendStatement, toStatementDTO } from '@/lib/billing/statements';

const STATUS = { NOT_FOUND: 404, NOT_SENDABLE: 409, ALREADY_SENT: 409, PAYMENT_INSTRUCTIONS_MISSING: 500, NO_RECIPIENT: 422, EMAIL_FAILED: 502 } as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ statementId: string }> }) {
  const { statementId } = await params;

  return withPlatformAdmin('POST /api/system/billing/statements/[id]/send', async () => {
    const body = (await req.json().catch(() => ({}))) as { resend?: unknown };
    const r = await sendStatement(statementId, { resend: body.resend === true });

    if (!r.ok) return NextResponse.json({ success: false, error: r.error, code: r.code }, { status: STATUS[r.code] });
    return NextResponse.json({ success: true, data: { statement: toStatementDTO(r.statement), sentTo: r.sentTo } });
  });
}

/**
 * /api/system/billing/statements   (platform admin only)
 *
 * GET  ?period=YYYY-MM[&status=DRAFT|SENT|PAID|VOID] — list statements.
 * POST { period, organisationId?, allowOpenPeriod? }  — generate DRAFT
 *      statements from the usage ledger for one site, or every site when
 *      organisationId is omitted. Safe to re-run: DRAFTs are rebuilt,
 *      SENT/PAID statements are never touched. Only closed months are
 *      billed unless allowOpenPeriod is true (for previews).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPlatformAdmin, readPeriodParam } from '@/lib/billing/routeHelpers';
import { isValidPeriodKey } from '@/lib/billing/period';
import { generateAllStatements, generateStatement, toStatementDTO } from '@/lib/billing/statements';

const STATUSES = ['DRAFT', 'SENT', 'PAID', 'VOID'] as const;

export async function GET(req: NextRequest) {
  const p = readPeriodParam(req.url);
  if ('error' in p) return p.error;
  const status = new URL(req.url).searchParams.get('status');
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
  }

  return withPlatformAdmin('GET /api/system/billing/statements', async () => {
    const rows = await prisma.billingStatement.findMany({
      where:   { periodKey: p.period, ...(status ? { status: status as (typeof STATUSES)[number] } : {}) },
      include: { organisation: { select: { name: true, brandName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({
      success: true,
      data: {
        statements: rows.map((r) => ({ ...toStatementDTO(r), organisationId: r.organisationId, siteName: r.organisation.brandName ?? r.organisation.name })),
      },
    });
  });
}

export async function POST(req: NextRequest) {
  return withPlatformAdmin('POST /api/system/billing/statements', async () => {
    const body = (await req.json().catch(() => ({}))) as { period?: unknown; organisationId?: unknown; allowOpenPeriod?: unknown };

    if (!isValidPeriodKey(body.period)) {
      return NextResponse.json({ success: false, error: 'period must be YYYY-MM, e.g. 2026-09' }, { status: 400 });
    }
    const opts = { allowOpenPeriod: body.allowOpenPeriod === true };

    if (typeof body.organisationId === 'string') {
      const org = await prisma.organisation.findUnique({ where: { id: body.organisationId }, select: { id: true } });
      if (!org) return NextResponse.json({ success: false, error: 'Site not found' }, { status: 404 });
      const r = await generateStatement(org.id, body.period, opts);
      return NextResponse.json({
        success: true,
        data: r.outcome === 'skipped'
          ? { outcome: r.outcome, reason: r.reason, statement: r.statement ? toStatementDTO(r.statement) : null }
          : { outcome: r.outcome, statement: toStatementDTO(r.statement) },
      });
    }

    const results = await generateAllStatements(body.period, opts);
    return NextResponse.json({ success: true, data: { period: body.period, results } });
  });
}

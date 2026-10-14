// scripts/backfill-usage-events.ts
//
// Adds usage-ledger rows for memorials that were created BEFORE manual
// billing existed (or while Stripe wasn't recording them), so they appear
// on a statement. The ledger starts empty at deploy time, so without this
// those memorials would never be billed.
//
// DECIDE --since CAREFULLY: any memorial Stripe already charged for must
// be before that date, or the site gets billed twice.
//
// Usage (dry run — prints what WOULD be recorded, writes nothing):
//   npx tsx scripts/backfill-usage-events.ts --since=2026-09-01
// Apply:
//   npx tsx scripts/backfill-usage-events.ts --since=2026-09-01 --apply
//
// Each row is priced as of the memorial's real creation time (so a memorial
// created during a site's free trial is recorded at $0) and is idempotent:
// memorials already in the ledger are skipped, so re-running is safe.

import { prisma } from '../lib/prisma';
import { recordUsage } from '../lib/billing/usage';
import { formatMoney } from '../lib/billing/pricing';

async function main() {
  const sinceArg = process.argv.find((a) => a.startsWith('--since='))?.slice('--since='.length);
  const apply = process.argv.includes('--apply');

  if (!sinceArg || Number.isNaN(Date.parse(sinceArg))) {
    console.error('Usage: npx tsx scripts/backfill-usage-events.ts --since=YYYY-MM-DD [--apply]');
    process.exit(1);
  }
  const since = new Date(sinceArg);

  const memorials = await prisma.memorial.findMany({
    where:   { organisationId: { not: null }, createdAt: { gte: since } },
    select:  { id: true, title: true, organisationId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const already = new Set(
    (await prisma.usageEvent.findMany({
      where:  { type: 'MEMORIAL_CREATED', memorialId: { in: memorials.map((m) => m.id) } },
      select: { memorialId: true },
    })).map((e) => e.memorialId),
  );

  const todo = memorials.filter((m) => !already.has(m.id));
  console.log(`${memorials.length} memorial(s) since ${sinceArg}; ${already.size} already recorded; ${todo.length} to backfill.`);

  let total = 0;
  for (const m of todo) {
    if (!apply) {
      console.log(`  would record: ${m.createdAt.toISOString().slice(0, 10)}  ${m.title}  (org ${m.organisationId})`);
      continue;
    }
    const r = await recordUsage(prisma, {
      organisationId: m.organisationId!,
      type:           'MEMORIAL_CREATED',
      memorialId:     m.id,
      memorialTitle:  m.title,
      at:             m.createdAt,
      note:           'Backfilled',
    });
    total += r.unitPriceCents;
    console.log(`  recorded: ${m.title}  ${formatMoney(r.unitPriceCents)}`);
  }

  console.log(apply ? `Done. Backfilled ${formatMoney(total)} across ${todo.length} memorial(s).` : 'Dry run only — re-run with --apply to write.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

// scripts/backfill-public-tokens.ts
//
// One-off: issues a publicToken for every Memorial that doesn't have one.
// New memorials now get a token at creation (lib/memorial/createMemorial.ts);
// this covers rows created before that change.
//
// Usage:  npx tsx scripts/backfill-public-tokens.ts
// Safe to re-run: only touches rows where publicToken IS NULL.

import { prisma } from '../lib/prisma';
import { generatePublicToken } from '../lib/qr';

async function main() {
  const rows = await prisma.memorial.findMany({
    where:  { publicToken: null },
    select: { id: true, title: true },
  });
  console.log(`Found ${rows.length} memorial(s) without a publicToken.`);

  for (const m of rows) {
    // updateMany with the null guard so a concurrent lazy-generation
    // (QR panel open) can never be overwritten.
    const res = await prisma.memorial.updateMany({
      where: { id: m.id, publicToken: null },
      data:  { publicToken: generatePublicToken() },
    });
    console.log(`${res.count ? 'set    ' : 'skipped'} ${m.id}  ${m.title}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

// scripts/backfill-memorial-slugs.ts
//
// One-off script: generates a slug for every existing Memorial row that
// doesn't have one yet. Run this ONCE after the nullable `slug` column
// has been added (migration add_memorial_slug), and BEFORE running the
// follow-up migration that tightens slug to NOT NULL + @unique — that
// second migration will fail if any row is still missing a slug.
//
// Usage:
//   npx tsx scripts/backfill-memorial-slugs.ts
//
// Safe to re-run: only processes rows where slug IS NULL, so running it
// twice is a no-op the second time.

import { prisma } from '../lib/prisma';
import { generateUniqueSlug } from '../lib/memorial/slug';

async function main() {
  const memorials = await prisma.memorial.findMany({
    where: { slug: null },
    select: { id: true, firstName: true, lastName: true, title: true },
  });

  console.log(`Found ${memorials.length} memorial(s) missing a slug.`);

  if (memorials.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (const memorial of memorials) {
    try {
      // Fall back to splitting `title` if firstName/lastName are somehow
      // both empty — title is always present (it's required at creation),
      // firstName/lastName are optional in the schema (older rows may
      // predate that split).
      const first = memorial.firstName ?? memorial.title.split(' ')[0] ?? 'memorial';
      const last = memorial.lastName ?? memorial.title.split(' ').slice(1).join(' ') ?? '';

      const slug = await generateUniqueSlug(first, last);

      await prisma.memorial.update({
        where: { id: memorial.id },
        data: { slug },
      });

      console.log(`  ${memorial.id} -> "${slug}"`);
      succeeded++;
    } catch (err) {
      console.error(`  FAILED for ${memorial.id}:`, err);
      failed++;
    }
  }

  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed.`);

  if (failed > 0) {
    console.error(
      '\nSome rows failed to backfill. Do NOT run the NOT NULL + @unique ' +
      'migration until every row has a slug — re-run this script after ' +
      'investigating the failures above.',
    );
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Backfill script crashed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

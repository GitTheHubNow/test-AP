/**
 * scripts/backfill-organisations.ts
 *
 * ONE-TIME script: creates a personal Organisation for every userId
 * that has memorials but no org membership, then links their memorials.
 *
 * Run AFTER deploying the schema migration:
 *   npx ts-node --project tsconfig.json scripts/backfill-organisations.ts
 *
 * Safe to run multiple times — skips users who already have an org.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting organisation backfill...\n');

  // Find all distinct ownerIds that have memorials
  const owners = await prisma.memorial.findMany({
    distinct: ['ownerId'],
    select:   { ownerId: true },
  });

  console.log(`Found ${owners.length} unique memorial owners\n`);

  let created = 0;
  let skipped = 0;

  for (const { ownerId } of owners) {
    // Check if already has an org membership
    const existing = await prisma.orgMember.findFirst({
      where: { userId: ownerId },
    });

    if (existing) {
      skipped++;
      continue;
    }

    // Create personal org
    const org = await prisma.organisation.create({
      data: {
        clerkOrgId: `personal_${ownerId}`,
        name:       'My Funeral Home',
        slug:       `user-${ownerId.slice(-8).toLowerCase()}`,
        plan:       'STARTER',
        members: {
          create: { userId: ownerId, role: 'OWNER' },
        },
      },
    });

    // Link all their memorials to the new org
    const { count } = await prisma.memorial.updateMany({
      where: { ownerId, organisationId: null },
      data:  { organisationId: org.id },
    });

    console.log(`✓ ${ownerId.slice(-8)} → org ${org.id} (${count} memorials linked)`);
    created++;
  }

  console.log(`\nDone. Created: ${created}, Skipped (already had org): ${skipped}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

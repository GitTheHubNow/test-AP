// app/family/dashboard/[memorialId]/page.tsx
//
// Deliberately a separate page tree from /dashboard/* (the Clerk/org
// staff dashboard), not a permission-gated variant of it. Structurally
// smaller and simpler by design — there is no route here that can reach
// moderation, billing, case management, or any other staff-only surface,
// because those pages simply don't exist under /family/*.

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { assertFamilyAccess, FamilyAccessError } from '@/lib/familyAccess';
import FamilyControlPanel from '@/components/family/FamilyControlPanel';

export default async function FamilyDashboardPage({
  params,
}: {
  params: Promise<{ memorialId: string }>;
}) {
  const { memorialId } = await params;

  try {
    await assertFamilyAccess(memorialId);
  } catch (error) {
    if (error instanceof FamilyAccessError) {
      // No token to redirect back to at this URL — send to a plain
      // message rather than a broken link, since the audience here may
      // not know what to do with an error code.
      redirect(`/family-access-expired`);
    }
    throw error;
  }

  const memorial = await prisma.memorial.findUnique({
    where:  { id: memorialId },
    select: {
      id: true, title: true, status: true, sealed: true,
      heroImageKey: true, birthDate: true, deathDate: true, description: true,
    },
  });

  if (!memorial) {
    redirect('/family-access-expired');
  }

  // Only content the funeral home has already approved is ever shown
  // here — a family member sees exactly what a public visitor would see
  // (plus their own hidden ones), never the moderation queue.
  const [memories, guestBookEntries] = await Promise.all([
    prisma.memory.findMany({
      where:  { memorialId, status: 'APPROVED' },
      select: { id: true, authorName: true, message: true, familyHidden: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.guestBookEntry.findMany({
      where:  { memorialId, status: 'APPROVED' },
      select: { id: true, authorName: true, message: true, familyHidden: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return (
    <FamilyControlPanel
      memorial={memorial}
      memories={memories}
      guestBookEntries={guestBookEntries}
    />
  );
}

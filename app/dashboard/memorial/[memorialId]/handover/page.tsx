import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { HandoverWorkspace } from '@/components/handover/HandoverWorkspace';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { resolveMemorialFields } from '@/lib/memorial/resolveMemorialFields';

interface Props {
  params: Promise<{ memorialId: string }>;
}

export default async function HandoverPage({ params }: Props) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // FIXED: previously a manual `ownerId !== userId` check, which blocked
  // every org staff member except the literal creator.
  try {
    await assertMemorialAccess(memorialId, userId, 'edit');
  } catch {
    notFound();
  }

  const memorial = await prisma.memorial.findUnique({
    where:  { id: memorialId },
    select: {
      id:            true,
      title:         true,
      workflowStage: true,
      funeralDate:   true,
      firstName:      true,
      lastName:       true,
      nominatedName:  true,
      nominatedEmail: true,
      venueName:      true,
      venueAddress:   true,
      funeralCase: {
        select: {
          deceasedName: true, serviceDate: true,
          familyContact: true, contactEmail: true,
          venueName: true, venueAddress: true,
        },
      },
      handover: {
        select: {
          id:                   true,
          status:               true,
          familyContactName:    true,
          familyContactEmail:   true,
          familyContactPhone:   true,
          scheduledAt:          true,
          completedAt:          true,
          cancelledAt:          true,
          cancelReason:         true,
          acceptToken:          true,
          acceptTokenExpiresAt: true,
          notificationSentAt:   true,
          createdAt:            true,
          familyAccessToken:    true,
          familyAccessEnabled:  true,
        },
      },
    },
  });

  if (!memorial) notFound();

  const resolved = resolveMemorialFields(memorial);

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const handover  = memorial.handover;
  const acceptUrl = handover?.acceptToken ? `${appUrl}/handover/accept/${handover.acceptToken}` : null;

  return (
    <HandoverWorkspace
      memorial={{
        id:            memorial.id,
        title:         memorial.title,
        workflowStage: memorial.workflowStage,
        funeralDate:   resolved.funeralDate?.toISOString() ?? null,
      }}
      handover={handover ? {
        id:                   handover.id,
        status:               handover.status,
        familyContactName:    handover.familyContactName,
        familyContactEmail:   handover.familyContactEmail,
        familyContactPhone:   handover.familyContactPhone,
        scheduledAt:          handover.scheduledAt?.toISOString()          ?? null,
        completedAt:          handover.completedAt?.toISOString()          ?? null,
        cancelledAt:          handover.cancelledAt?.toISOString()          ?? null,
        cancelReason:         handover.cancelReason,
        acceptTokenExpiresAt: handover.acceptTokenExpiresAt?.toISOString() ?? null,
        notificationSentAt:   handover.notificationSentAt?.toISOString()   ?? null,
        acceptUrl,
        createdAt:            handover.createdAt.toISOString(),
        familyAccessToken:    handover.familyAccessToken,
        familyAccessEnabled:  handover.familyAccessEnabled,
      } : null}
    />
  );
}

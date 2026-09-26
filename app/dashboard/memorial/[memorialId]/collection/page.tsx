import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { CollectionWorkspace } from '@/components/collection/CollectionWorkspace';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { resolveMemorialFields } from '@/lib/memorial/resolveMemorialFields';

interface Props {
  params: Promise<{ memorialId: string }>;
}

export default async function CollectionPage({ params }: Props) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // FIXED: previously a manual `ownerId !== userId` check, which blocked
  // every org staff member except the literal creator. This page can
  // generate invite links and manage content, so 'edit' is right.
  try {
    await assertMemorialAccess(memorialId, userId, 'edit');
  } catch {
    notFound();
  }

  const memorial = await prisma.memorial.findUnique({
    where:  { id: memorialId },
    select: {
      id:             true,
      title:          true,
      firstName:      true,
      lastName:       true,
      funeralDate:    true,
      workflowStage:  true,
      collectionNotes: true,
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
      collectionItems: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        select: {
          id:              true,
          type:            true,
          status:          true,
          uploaderRole:    true,
          title:           true,
          description:     true,
          category:        true,
          blobKey:         true,
          mimeType:        true,
          sizeBytes:       true,
          showPublicly:    true,
          featured:        true,
          rejectionReason: true,
          createdAt:       true,
          invite: { select: { recipientName: true } },
        },
      },
      collectionInvites: {
        orderBy: { createdAt: 'desc' },
        select: {
          id:            true,
          token:         true,
          recipientName: true,
          recipientEmail: true,
          status:        true,
          expiresAt:     true,
          usedAt:        true,
          uploadCount:   true,
          createdAt:     true,
        },
      },
    },
  });

  if (!memorial) notFound();

  const resolved = resolveMemorialFields(memorial);

  // Compute counts for the header chips
  const counts = {
    total:    memorial.collectionItems.length,
    unsorted: memorial.collectionItems.filter(i => i.status === 'UNSORTED').length,
    ready:    memorial.collectionItems.filter(i => i.status === 'READY').length,
    approved: memorial.collectionItems.filter(i => i.status === 'APPROVED').length,
    rejected: memorial.collectionItems.filter(i => i.status === 'REJECTED').length,
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  return (
    <CollectionWorkspace
      memorial={{
        id:             memorial.id,
        title:          memorial.title,
        firstName:      resolved.firstName,
        lastName:       resolved.lastName,
        funeralDate:    resolved.funeralDate?.toISOString() ?? null,
        workflowStage:  memorial.workflowStage,
        collectionNotes: memorial.collectionNotes,
      }}
      items={memorial.collectionItems.map(item => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      }))}
      invites={memorial.collectionInvites.map(inv => ({
        ...inv,
        url:       `${appUrl}/collect/${inv.token}`,
        expiresAt: inv.expiresAt.toISOString(),
        usedAt:    inv.usedAt?.toISOString() ?? null,
        createdAt: inv.createdAt.toISOString(),
      }))}
      counts={counts}
    />
  );
}

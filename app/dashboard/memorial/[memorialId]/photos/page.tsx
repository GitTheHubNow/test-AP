import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { getPublicUrl } from '@/lib/upload-shared';
import { PhotoCollectionManager } from '@/components/photos/PhotoCollectionManager';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';

interface Props {
  params: { memorialId: string };
}

export default async function PhotosPage({ params }: Props) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // FIXED: previously a manual `ownerId !== userId` check, which blocked
  // every org staff member except the literal creator — same bug as the
  // API route sweep, but this one lives in a page Server Component, so
  // it wasn't caught by that pass (which only covered app/api/**).
  try {
    await assertMemorialAccess(params.memorialId, userId, 'read');
  } catch {
    notFound();
  }

  const memorial = await prisma.memorial.findUnique({
    where:  { id: params.memorialId },
    select: {
      id:               true,
      title:            true,
      firstName:        true,
      lastName:         true,
      preferredName:    true,
      uploadLinkToken:  true,
      uploadLinkEnabled: true,
      workflowStage:    true,
    },
  });

  if (!memorial) notFound();

  // Fetch all collection items that are PHOTOs (and VIDEOs for completeness)
  const items = await prisma.collectionItem.findMany({
    where:   { memorialId: params.memorialId, type: { in: ['PHOTO', 'VIDEO'] } },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id:            true,
      type:          true,
      status:        true,
      blobKey:       true,
      mimeType:      true,
      sizeBytes:     true,
      title:         true,
      caption:       true,
      uploaderName:  true,
      uploaderEmail: true,
      uploaderRole:  true,
      forTribute:    true,
      forMemorial:   true,
      isHero:        true,
      sortOrder:     true,
      tributeOrder:  true,
      tributeDuration: true,
      rejectionReason: true,
      createdAt:     true,
    },
  });

  // Attach public URLs
  const photos = items.map(item => ({
    ...item,
    url:       item.blobKey ? getPublicUrl(item.blobKey) : null,
    createdAt: item.createdAt.toISOString(),
  }));

  // Group by uploader for the "who uploaded what" view
  const uploaderGroups = groupByUploader(photos);

  // Counts
  const counts = {
    total:      photos.length,
    unsorted:   photos.filter(p => p.status === 'UNSORTED').length,
    forTribute: photos.filter(p => p.forTribute).length,
    forMemorial: photos.filter(p => p.forMemorial).length,
    rejected:   photos.filter(p => p.status === 'REJECTED').length,
  };

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const uploadUrl = memorial.uploadLinkToken
    ? `${appUrl}/upload/${memorial.uploadLinkToken}`
    : null;

  return (
    <PhotoCollectionManager
      memorial={{
        id:            memorial.id,
        title:         memorial.title,
        displayName:   memorial.preferredName
                        || (memorial.firstName && memorial.lastName
                            ? `${memorial.firstName} ${memorial.lastName}`
                            : memorial.title),
        workflowStage: memorial.workflowStage,
        uploadUrl,
        uploadLinkEnabled: memorial.uploadLinkEnabled,
      }}
      photos={photos}
      uploaderGroups={uploaderGroups}
      counts={counts}
    />
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function groupByUploader(photos: ReturnType<typeof photos_shape>) {
  const map = new Map<string, { name: string; email: string | null; role: string; photos: typeof photos }>();

  for (const p of photos) {
    const key = p.uploaderName ?? p.uploaderEmail ?? p.uploaderRole ?? 'Unknown';
    const role = p.uploaderRole ?? 'PUBLIC';

    if (!map.has(key)) {
      map.set(key, {
        name:   p.uploaderName ?? (role === 'STAFF' ? 'Funeral Home' : 'Family / Guest'),
        email:  p.uploaderEmail ?? null,
        role,
        photos: [],
      });
    }
    map.get(key)!.photos.push(p);
  }

  return Array.from(map.values()).sort((a, b) => b.photos.length - a.photos.length);
}

// Dummy type reference for helper
function photos_shape() {
  return [] as {
    id: string; type: string; status: string; blobKey: string | null;
    mimeType: string | null; sizeBytes: number | null; title: string | null;
    caption: string | null; uploaderName: string | null; uploaderEmail: string | null;
    uploaderRole: string; forTribute: boolean; forMemorial: boolean; isHero: boolean;
    sortOrder: number | null; tributeOrder: number | null; tributeDuration: number | null;
    rejectionReason: string | null; createdAt: string; url: string | null;
  }[];
}

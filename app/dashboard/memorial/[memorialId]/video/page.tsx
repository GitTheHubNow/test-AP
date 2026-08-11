import { notFound, redirect } from 'next/navigation';
import { auth }               from '@clerk/nextjs/server';
import { prisma }             from '@/lib/prisma';
import { getPublicUrl }       from '@/lib/upload-shared';
import { TributeVideoCreator } from '@/components/video/TributeVideoCreator';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';

interface Props {
  params: { memorialId: string };
}

function toProxyUrl(blobKey: string): string {
  if (blobKey.startsWith('http://') || blobKey.startsWith('https://')) {
    return `/api/music/proxy?url=${encodeURIComponent(blobKey)}`;
  }
  return blobKey.startsWith('/') ? blobKey : `/${blobKey}`;
}

export default async function VideoPage({ params }: Props) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // FIXED: previously a manual `ownerId !== userId` check, which blocked
  // every org staff member except the literal creator. This page has an
  // editor (TributeVideoCreator), so 'edit' is the right permission level.
  try {
    await assertMemorialAccess(params.memorialId, userId, 'edit');
  } catch {
    notFound();
  }

  const memorial = await prisma.memorial.findUnique({
    where:  { id: params.memorialId },
    select: {
      id:            true,
      title:         true,
      firstName:     true,
      lastName:      true,
      preferredName: true,
      birthDate:     true,
      deathDate:     true,
      tributeVideo: {
        select: {
          id:             true,
          status:         true,
          theme:          true,
          musicTrackId:   true,
          photoOrder:     true,
          titleCardText:  true,
          endCardText:    true,
          showOnMemorial: true,
          webBlobKey:     true,
        },
      },
    },
  });

  if (!memorial) notFound();

  // Photos marked forTribute
  const photos = await prisma.collectionItem.findMany({
    where: {
      memorialId: params.memorialId,
      type:       'PHOTO',
      forTribute: true,
      status:     'APPROVED',
    },
    orderBy: [{ tributeOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id:              true,
      blobKey:         true,
      caption:         true,
      tributeOrder:    true,
      tributeDuration: true,
      uploaderName:    true,
    },
  });

  // Music library
  const tracks = await prisma.musicTrack.findMany({
    where:   { active: true },
    orderBy: [{ category: 'asc' }, { title: 'asc' }],
    select: {
      id:              true,
      title:           true,
      artist:          true,
      category:        true,
      durationSeconds: true,
      blobKey:         true,
      previewBlobKey:  true,
    },
  });

  const displayName =
    memorial.preferredName ||
    [memorial.firstName, memorial.lastName].filter(Boolean).join(' ') ||
    memorial.title ||
    'Memorial';

  return (
    <TributeVideoCreator
      memorial={{
        id:          memorial.id,
        displayName,
        birthDate:   memorial.birthDate?.toISOString()  ?? null,
        deathDate:   memorial.deathDate?.toISOString()  ?? null,
        existingVideo: memorial.tributeVideo
          ? { ...memorial.tributeVideo, photoOrder: memorial.tributeVideo.photoOrder as any[] }
          : null,
      }}
      photos={photos.map(p => ({
        id:              p.id,
        url:             p.blobKey ? getPublicUrl(p.blobKey) : null,
        caption:         p.caption         ?? null,
        tributeOrder:    p.tributeOrder    ?? null,
        tributeDuration: p.tributeDuration ?? null,
        uploaderName:    p.uploaderName    ?? null,
      }))}
      tracks={tracks.map(t => ({
        id:              t.id,
        title:           t.title,
        artist:          t.artist          ?? null,
        category:        t.category,
        durationSeconds: t.durationSeconds,
        // Both preview and full track go through proxy to bypass COEP
        previewUrl:      toProxyUrl(t.previewBlobKey ?? t.blobKey),
      }))}
    />
  );
}

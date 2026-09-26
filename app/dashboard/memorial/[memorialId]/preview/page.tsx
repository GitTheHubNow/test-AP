import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { MemoryStatus, MediaStatus } from '@prisma/client';
import { getPublicUrl } from '@/lib/upload-shared';
import { PreviewWorkspace } from '@/components/preview/PreviewWorkspace';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { resolveMemorialFields } from '@/lib/memorial/resolveMemorialFields';

interface Props {
  params: Promise<{ memorialId: string }>;
}

export default async function PreviewPage({ params }: Props) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // FIXED: previously a manual `ownerId !== userId` check, which blocked
  // every org staff member except the literal creator. Read-only preview,
  // so 'read' is the right permission level.
  try {
    await assertMemorialAccess(memorialId, userId, 'read');
  } catch {
    notFound();
  }

  const memorial = await prisma.memorial.findUnique({
    where:  { id: memorialId },
    select: {
      id:                    true,
      title:                 true,
      firstName:             true,
      lastName:              true,
      description:           true,
      birthDate:             true,
      deathDate:             true,
      status:                true,
      workflowStage:         true,
      publishedAt:           true,
      familyConsentConfirmed: true,
      funeralDate:           true,
      readOnly:              true,
      isAboriginal:          true,
      isTorresStraitIslander: true,
      isSouthSeaIslander:    true,
      isMaori:               true,
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
      settings: {
        select: {
          primaryColor:    true,
          backgroundColor: true,
          fontFamily:      true,
          showTimeline:    true,
          showGallery:     true,
          showGuestBook:   true,
          showMemoryCount: true,
          guestBookTitle:  true,
        },
      },
      collectionItems: {
        select: { id: true, status: true, blobKey: true },
      },
    },
  });

  if (!memorial) notFound();

  const resolved = resolveMemorialFields(memorial);

  // Fetch approved memories for the preview
  const memories = await prisma.memory.findMany({
    where:   { memorialId: memorialId, status: MemoryStatus.APPROVED, isGuestBook: false },
    orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
    select: {
      id:          true,
      authorName:  true,
      message:     true,
      createdAt:   true,
      featured:    true,
      category:    true,
      isGuestBook: true,
      media: {
        where:   { status: MediaStatus.APPROVED },
        select:  { id: true, blobKey: true, mimeType: true },
        orderBy: { createdAt: 'asc' },
      },
      reactions: { select: { emoji: true } },
    },
  });

  const guestBookEntries = await prisma.memory.findMany({
    where:   { memorialId: memorialId, status: MemoryStatus.APPROVED, isGuestBook: true },
    orderBy: { createdAt: 'desc' },
    select:  { id: true, authorName: true, message: true, createdAt: true },
  });

  const s               = memorial.settings;
  const primaryColor    = s?.primaryColor    ?? '#7c6d5a';
  const backgroundColor = s?.backgroundColor ?? '#faf8f5';
  const showTimeline    = s?.showTimeline    ?? true;
  const showGallery     = s?.showGallery     ?? true;
  const showGuestBook   = s?.showGuestBook   ?? true;
  const showMemoryCount = s?.showMemoryCount ?? true;
  const guestBookTitle  = s?.guestBookTitle  ?? 'Guest Book';

  const fmtDate = (d: Date | null) => {
    if (!d) return null;
    const p = new Date(d);
    if (p.getFullYear() < 1900) return null;
    return p.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const allMedia = memories.flatMap(m =>
    m.media.map(med => ({ ...med, url: getPublicUrl(med.blobKey), memoryAuthor: m.authorName, memoryId: m.id }))
  );

  const shapedMemories = memories.map(m => {
    const counts: Record<string, number> = {};
    for (const r of m.reactions) counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
    const { reactions: _, ...rest } = m;
    return {
      ...rest,
      media:          m.media.map(med => ({ ...med, url: getPublicUrl(med.blobKey) })),
      reactionCounts: counts,
      myReactions:    [] as string[],
    };
  });

  // Publish checklist
  const collectionApproved = memorial.collectionItems.filter(i => i.status === 'APPROVED').length;
  const collectionUnsorted = memorial.collectionItems.filter(i => i.status === 'UNSORTED').length;

  const checklist = {
    hasName:        !!(resolved.firstName || resolved.lastName || memorial.title),
    hasDates:       !!(memorial.birthDate || memorial.deathDate),
    hasDescription: !!memorial.description,
    hasMemories:    memories.length > 0,
    hasMedia:       collectionApproved > 0,
    noUnsorted:     collectionUnsorted === 0,
    hasConsent:     memorial.familyConsentConfirmed,
  };

  const checklistPassed = Object.values(checklist).filter(Boolean).length;
  const checklistTotal  = Object.values(checklist).length;
  const canPublish      = checklist.hasName && checklist.hasMemories && checklist.hasConsent;

  return (
    <PreviewWorkspace
      memorial={{
        id:             memorial.id,
        title:          memorial.title,
        firstName:      resolved.firstName,
        lastName:       resolved.lastName,
        description:    memorial.description,
        birthDate:      fmtDate(memorial.birthDate),
        deathDate:      fmtDate(memorial.deathDate),
        workflowStage:  memorial.workflowStage,
        publishedAt:    memorial.publishedAt?.toISOString() ?? null,
        familyConsentConfirmed: memorial.familyConsentConfirmed,
        primaryColor,
        backgroundColor,
        showTimeline,
        showGallery,
        showGuestBook,
        showMemoryCount,
        guestBookTitle,
      }}
      memories={shapedMemories.map(m => ({ ...m, createdAt: m.createdAt.toISOString() }))}
      guestBookEntries={guestBookEntries.map(g => ({ ...g, createdAt: g.createdAt.toISOString() }))}
      allMedia={allMedia}
      checklist={checklist}
      checklistPassed={checklistPassed}
      checklistTotal={checklistTotal}
      canPublish={canPublish}
      collectionApproved={collectionApproved}
      collectionUnsorted={collectionUnsorted}
    />
  );
}

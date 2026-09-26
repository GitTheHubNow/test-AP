import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { GuestBookList } from '@/components/GuestBookList';
import Link from 'next/link';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { isTributeUnlocked, daysUntilTributeUnlock } from '@/lib/memorial/journeyGate';
import { resolveMemorialFields } from '@/lib/memorial/resolveMemorialFields';
import { SectionLockedScreen } from '@/components/memorial/SectionLockedScreen';

interface GuestBookPageProps {
  params: Promise<{ memorialId: string }>;
}

export default async function GuestBookPage({ params }: GuestBookPageProps) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // FIXED: previously a manual `ownerId !== userId` check, which blocked
  // every org staff member except the literal creator.
  try {
    await assertMemorialAccess(memorialId, userId, 'read');
  } catch {
    notFound();
  }

  const memorial = await prisma.memorial.findUnique({
    where:  { id: memorialId },
    select: {
      id: true, title: true,
      funeralDate: true, tributeUnlockOverride: true,
      // PRIORITY 3 FIX: this is server-side enforcement of the section
      // gate (see comment below) — a stale funeralDate on a case-linked
      // memorial could let staff bypass a lock that should still be
      // active, or block access that should already be open. Not just
      // display: an access-control decision.
      nominatedName:  true,
      nominatedEmail: true,
      venueName:      true,
      venueAddress:   true,
      firstName:      true,
      lastName:       true,
      funeralCase: {
        select: {
          deceasedName: true, serviceDate: true,
          familyContact: true, contactEmail: true,
          venueName: true, venueAddress: true,
        },
      },
    },
  });

  if (!memorial) notFound();

  const resolvedFuneralDate = resolveMemorialFields(memorial).funeralDate;

  // Server-side enforcement of the same gate the sidebar reflects — see
  // lib/memorial/journeyGate.ts. Guest Book unlocks together with Photos
  // and Tribute Video, normally 5 days before the service.
  if (!isTributeUnlocked({ funeralDate: resolvedFuneralDate, tributeUnlockOverride: memorial.tributeUnlockOverride })) {
    const daysLeft = daysUntilTributeUnlock({ funeralDate: resolvedFuneralDate, tributeUnlockOverride: memorial.tributeUnlockOverride });
    return (
      <SectionLockedScreen
        memorialId={memorial.id}
        sectionName="Guest Book"
        daysLeft={daysLeft}
        hasFuneralDate={Boolean(resolvedFuneralDate)}
      />
    );
  }

  const entrySelect = {
    id: true, authorName: true, message: true, location: true,
    createdAt: true, pinned: true, flaggedByFilter: true, filterReason: true,
  };

  const [pendingEntries, approvedEntries] = await Promise.all([
    prisma.guestBookEntry.findMany({
      where:   { memorialId: memorialId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take:    50,
      select:  entrySelect,
    }),
    prisma.guestBookEntry.findMany({
      where:   { memorialId: memorialId, status: 'APPROVED' },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take:    100,
      select:  entrySelect,
    }),
  ]);

  const pendingCount = pendingEntries.length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ivory)' }}>

      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <Link
              href="/dashboard/memorials"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--ash)', textDecoration: 'none', fontFamily: 'var(--font-body)', letterSpacing: '0.04em' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Memorials
            </Link>
            <span style={{ color: 'var(--ivory-mid)', fontSize: '0.75rem' }}>/</span>
            <div>
              <h1 className="page-header-title">Guest Book</h1>
              <p className="page-header-sub">{memorial.title}</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 600, color: pendingCount > 0 ? 'var(--gold)' : 'var(--ink)', lineHeight: 1 }}>
                {pendingCount}
              </div>
              <div style={{ fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ash)', marginTop: '0.2rem' }}>
                Pending
              </div>
            </div>
            <Link href={`/dashboard/memorial/${memorialId}/settings`} className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.45rem 0.9rem' }}>
              Settings →
            </Link>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="card-elevated" style={{ padding: '2rem 2.5rem' }}>
          <GuestBookList
            memorialId={memorialId}
            pendingEntries={pendingEntries}
            approvedEntries={approvedEntries}
          />
        </div>
      </div>

    </div>
  );
}

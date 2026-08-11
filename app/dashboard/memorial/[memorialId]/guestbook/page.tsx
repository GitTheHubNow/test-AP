import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { GuestBookList } from '@/components/GuestBookList';
import Link from 'next/link';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';

interface GuestBookPageProps {
  params: { memorialId: string };
}

export default async function GuestBookPage({ params }: GuestBookPageProps) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // FIXED: previously a manual `ownerId !== userId` check, which blocked
  // every org staff member except the literal creator.
  try {
    await assertMemorialAccess(params.memorialId, userId, 'read');
  } catch {
    notFound();
  }

  const memorial = await prisma.memorial.findUnique({
    where:  { id: params.memorialId },
    select: { id: true, title: true },
  });

  if (!memorial) notFound();

  const entrySelect = {
    id: true, authorName: true, message: true, location: true,
    createdAt: true, pinned: true, flaggedByFilter: true, filterReason: true,
  };

  const [pendingEntries, approvedEntries] = await Promise.all([
    prisma.guestBookEntry.findMany({
      where:   { memorialId: params.memorialId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take:    50,
      select:  entrySelect,
    }),
    prisma.guestBookEntry.findMany({
      where:   { memorialId: params.memorialId, status: 'APPROVED' },
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
            <Link href={`/dashboard/memorial/${params.memorialId}/settings`} className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.45rem 0.9rem' }}>
              Settings →
            </Link>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="card-elevated" style={{ padding: '2rem 2.5rem' }}>
          <GuestBookList
            memorialId={params.memorialId}
            pendingEntries={pendingEntries}
            approvedEntries={approvedEntries}
          />
        </div>
      </div>

    </div>
  );
}

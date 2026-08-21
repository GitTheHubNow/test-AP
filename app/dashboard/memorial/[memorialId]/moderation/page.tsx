import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { MemoryStatus } from '@prisma/client';
import { ModerationList } from '@/components/ModerationList';
import Link from 'next/link';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';

interface ModerationPageProps {
  params: Promise<{ memorialId: string }>;
}

export default async function ModerationPage({ params }: ModerationPageProps) {
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
    select: { id: true, title: true, status: true },
  });

  if (!memorial) notFound();

  const memorySelect = {
    id: true, authorName: true, message: true, createdAt: true,
    featured: true, isGuestBook: true, category: true,
    stale: true, visibleUntil: true,
    media: {
      select: { id: true, blobKey: true, mimeType: true, sizeBytes: true, status: true, createdAt: true },
      orderBy: { createdAt: 'asc' as const },
    },
  };

  const [pendingMemories, approvedMemories] = await Promise.all([
    prisma.memory.findMany({
      where:   { memorialId: memorialId, status: MemoryStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      take:    50,
      select:  memorySelect,
    }),
    prisma.memory.findMany({
      where:   { memorialId: memorialId, status: MemoryStatus.APPROVED },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      take:    100,
      select:  memorySelect,
    }),
  ]);

  const pendingCount  = pendingMemories.length;
  const approvedCount = approvedMemories.length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ivory)' }}>

      {/* Page header */}
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
              <h1 className="page-header-title">Memories</h1>
              <p className="page-header-sub">{memorial.title}</p>
            </div>
          </div>

          {/* Quick stats + settings link */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 600, color: pendingCount > 0 ? 'var(--gold)' : 'var(--ink)', lineHeight: 1 }}>{pendingCount}</div>
                <div style={{ fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ash)', marginTop: '0.2rem' }}>Pending</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 600, color: 'var(--ink)', lineHeight: 1 }}>{approvedCount}</div>
                <div style={{ fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ash)', marginTop: '0.2rem' }}>Published</div>
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
          <ModerationList
            memorial={{ id: memorial.id, title: memorial.title }}
            pendingMemories={pendingMemories}
            approvedMemories={approvedMemories}
            memorialId={memorialId}
          />
        </div>
      </div>

    </div>
  );
}

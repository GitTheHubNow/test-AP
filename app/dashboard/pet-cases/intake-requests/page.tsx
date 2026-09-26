// app/dashboard/pet-cases/intake-requests/page.tsx
//
// Staff review queue for public QR-intake submissions. Mirrors
// app/dashboard/pet-cases/page.tsx's structure — server component
// pre-fetches PENDING requests, IntakeRequestList client component
// handles the approve/reject interactions.

import { redirect }            from 'next/navigation';
import { auth }                from '@clerk/nextjs/server';
import { prisma }              from '@/lib/prisma';
import { getOrgIdForUser }     from '@/lib/tenant';
import Link                    from 'next/link';
import { IntakeRequestList }   from '@/components/pet-cases/IntakeRequestList';

export const dynamic = 'force-dynamic';

export default async function IntakeRequestsPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const orgId = await getOrgIdForUser(userId).catch(() => null);
  if (!orgId) redirect('/dashboard');

  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { name: true, featurePetAftercare: true },
  });
  if (!org?.featurePetAftercare) redirect('/dashboard/pet-cases');

  const initialRequests = await prisma.petIntakeRequest.findMany({
    where:   { organisationId: orgId, status: 'PENDING' },
    orderBy: [{ createdAt: 'asc' }],
  });

  const serialised = initialRequests.map(r => ({
    ...r,
    createdAt:  r.createdAt.toISOString(),
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
  }));

  return (
    <div style={styles.page}>
      <div style={styles.inner}>

        <div style={styles.header}>
          <div>
            <Link href="/dashboard/pet-cases" style={styles.back}>← Pet Cases</Link>
            <h1 style={styles.title}>Intake Requests</h1>
            <p style={styles.subtitle}>{org.name}</p>
          </div>
          <Link href="/dashboard/pet-cases/intake-qr" style={styles.qrLink}>
            View QR code →
          </Link>
        </div>

        <IntakeRequestList initialRequests={serialised as any} />

      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight:  '100vh',
    background: '#f7f5f2',
    padding:    '2.5rem 1rem',
  },
  inner: {
    maxWidth: '760px',
    margin:   '0 auto',
  },
  header: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   '2rem',
    gap:            '1rem',
    flexWrap:       'wrap',
  },
  back: {
    color:          'rgba(10,10,22,0.4)',
    fontSize:       '0.82rem',
    fontFamily:     'system-ui, sans-serif',
    textDecoration: 'none',
    display:        'block',
    marginBottom:   '0.35rem',
  },
  title: {
    margin:     0,
    fontSize:   '1.4rem',
    fontWeight: 700,
    color:      '#4f5d75',
    fontFamily: 'system-ui, sans-serif',
  },
  subtitle: {
    margin:     '0.2rem 0 0',
    fontSize:   '0.85rem',
    color:      'rgba(10,10,22,0.5)',
    fontFamily: 'system-ui, sans-serif',
  },
  qrLink: {
    color:          '#cdba93',
    fontSize:       '0.85rem',
    fontWeight:     600,
    fontFamily:     'system-ui, sans-serif',
    textDecoration: 'none',
    whiteSpace:     'nowrap',
    marginTop:      '0.3rem',
  },
};

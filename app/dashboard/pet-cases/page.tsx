// app/dashboard/pet-cases/page.tsx
//
// Org-wide pet case list. Mirrors app/dashboard/cases/page.tsx exactly in
// structure — server component pre-fetches ACTIVE cases, PetCaseList
// client component handles filter switching.

import { redirect }        from 'next/navigation';
import { auth }            from '@clerk/nextjs/server';
import { prisma }          from '@/lib/prisma';
import { getOrgIdForUser } from '@/lib/tenant';
import Link                from 'next/link';
import { PetCaseList }     from '@/components/pet-cases/PetCaseList';

export const dynamic = 'force-dynamic';

export default async function PetCasesPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const orgId = await getOrgIdForUser(userId).catch(() => null);
  if (!orgId) redirect('/dashboard');

  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { name: true, featurePetAftercare: true },
  });
  if (!org) redirect('/dashboard');

  const featureEnabled = org.featurePetAftercare;

  let initialCases: Awaited<ReturnType<typeof prisma.petCase.findMany>> = [];
  let pendingIntakeCount = 0;

  if (featureEnabled) {
    [initialCases, pendingIntakeCount] = await Promise.all([
      prisma.petCase.findMany({
        where:   { organisationId: orgId, status: 'ACTIVE' },
        orderBy: [{ createdAt: 'desc' }],
        include: {
          memorial: {
            select: {
              id: true, qrTokenHash: true, title: true,
              firstName: true, lastName: true, preferredName: true, status: true,
            },
          },
        },
      }),
      prisma.petIntakeRequest.count({ where: { organisationId: orgId, status: 'PENDING' } }),
    ]);
  }

  return (
    <div style={styles.page}>
      <div style={styles.inner}>

        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Pet Cases</h1>
            <p style={styles.subtitle}>{org.name}</p>
          </div>
          {featureEnabled && (
            <div style={styles.headerActions}>
              <Link href="/dashboard/pet-cases/intake-requests" style={styles.secondaryLink}>
                Intake requests
                {pendingIntakeCount > 0 && (
                  <span style={styles.countBadge}>{pendingIntakeCount}</span>
                )}
              </Link>
              <Link href="/dashboard/pet-cases/intake-qr" style={styles.secondaryLink}>
                Intake QR code
              </Link>
              <Link href="/dashboard/pet-cases/new" style={styles.newBtn}>
                + New pet case
              </Link>
            </div>
          )}
        </div>

        {!featureEnabled ? (
          <div style={styles.notice}>
            <p style={styles.noticeText}>
              The Pet Aftercare feature is not enabled for your organisation.
              Contact support to enable it.
            </p>
          </div>
        ) : (
          <PetCaseList initialCases={initialCases as any} />
        )}

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
    maxWidth: '860px',
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
  headerActions: {
    display:    'flex',
    alignItems: 'center',
    gap:        '0.75rem',
    flexWrap:   'wrap',
  },
  secondaryLink: {
    display:        'flex',
    alignItems:     'center',
    gap:            '0.4rem',
    color:          'rgba(10,10,22,0.55)',
    fontSize:       '0.82rem',
    fontWeight:     600,
    fontFamily:     'system-ui, sans-serif',
    textDecoration: 'none',
    whiteSpace:     'nowrap',
  },
  countBadge: {
    background:    '#b91c1c',
    color:         '#fff',
    fontSize:      '0.68rem',
    fontWeight:    700,
    borderRadius:  '999px',
    padding:       '0.05em 0.5em',
    lineHeight:    1.5,
  },
  newBtn: {
    background:    '#4f5d75',
    color:         '#f0ece4',
    borderRadius:  '7px',
    padding:       '0.55rem 1.1rem',
    fontSize:      '0.875rem',
    fontWeight:    600,
    fontFamily:    'system-ui, sans-serif',
    textDecoration:'none',
    whiteSpace:    'nowrap',
  },
  notice: {
    background:   '#fff',
    border:       '1px solid rgba(10,10,22,0.1)',
    borderRadius: '10px',
    padding:      '1.5rem',
  },
  noticeText: {
    margin:     0,
    fontSize:   '0.875rem',
    color:      'rgba(10,10,22,0.6)',
    lineHeight: 1.6,
    fontFamily: 'system-ui, sans-serif',
  },
};

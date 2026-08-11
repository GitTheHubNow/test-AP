// app/dashboard/cases/page.tsx
//
// Org-wide case list. Shows all FuneralCases for the org.
// Server component pre-fetches ACTIVE cases for initial render.
// CaseList client component handles filter switching and interactions.

import { redirect }        from 'next/navigation';
import { auth }            from '@clerk/nextjs/server';
import { prisma }          from '@/lib/prisma';
import { getOrgIdForUser } from '@/lib/tenant';
import Link                from 'next/link';
import { CaseList }        from '@/components/cases/CaseList';

export const dynamic = 'force-dynamic';

export default async function CasesPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const orgId = await getOrgIdForUser(userId).catch(() => null);
  if (!orgId) redirect('/dashboard');

  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { name: true, featureCaseLite: true },
  });
  if (!org) redirect('/dashboard');

  const featureEnabled = org.featureCaseLite;

  const initialCases = featureEnabled
    ? await prisma.funeralCase.findMany({
        where:   { organisationId: orgId, status: 'ACTIVE' },
        orderBy: [{ serviceDate: 'asc' }, { createdAt: 'desc' }],
        include: {
          memorial: {
            select: {
              id: true, qrTokenHash: true, title: true,
              firstName: true, lastName: true, preferredName: true, status: true,
            },
          },
        },
      })
    : [];

  return (
    <div style={styles.page}>
      <div style={styles.inner}>

        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Cases</h1>
            <p style={styles.subtitle}>{org.name}</p>
          </div>
          {featureEnabled && (
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <Link href="/dashboard/cases/import" style={styles.importBtn}>
                Import CSV
              </Link>
              <Link href="/dashboard/cases/new" style={styles.newBtn}>
                + New case
              </Link>
            </div>
          )}
        </div>

        {!featureEnabled ? (
          <div style={styles.notice}>
            <p style={styles.noticeText}>
              The Case Lite feature is not enabled for your organisation.
              Contact support to enable it.
            </p>
          </div>
        ) : (
          <CaseList initialCases={initialCases as any} />
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
    color:      '#0a0a16',
    fontFamily: 'system-ui, sans-serif',
  },
  subtitle: {
    margin:     '0.2rem 0 0',
    fontSize:   '0.85rem',
    color:      'rgba(10,10,22,0.5)',
    fontFamily: 'system-ui, sans-serif',
  },
  newBtn: {
    background:    '#0a0a16',
    color:         '#f0ece4',
    borderRadius:  '7px',
    padding:       '0.55rem 1.1rem',
    fontSize:      '0.875rem',
    fontWeight:    600,
    fontFamily:    'system-ui, sans-serif',
    textDecoration:'none',
    whiteSpace:    'nowrap',
  },
  importBtn: {
    background:    'transparent',
    color:         '#0a0a16',
    border:        '1px solid rgba(10,10,22,0.18)',
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

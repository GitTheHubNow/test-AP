// app/dashboard/cases/[caseId]/page.tsx
//
// Single case detail and edit page.
// Server component fetches the case; CaseDetail is the interactive client component.

import { redirect, notFound } from 'next/navigation';
import { auth }               from '@clerk/nextjs/server';
import { prisma }             from '@/lib/prisma';
import { getOrgIdForUser }    from '@/lib/tenant';
import Link                   from 'next/link';
import { CaseDetail }         from '@/components/cases/CaseDetail';

interface Props { params: Promise<{ caseId: string }> }

export const dynamic = 'force-dynamic';

export default async function CaseDetailPage({ params }: Props) {
  const { caseId } = await params;

  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const orgId = await getOrgIdForUser(userId).catch(() => null);
  if (!orgId) redirect('/dashboard');

  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { featureCaseLite: true },
  });
  if (!org?.featureCaseLite) redirect('/dashboard/cases');

  const funeralCase = await prisma.funeralCase.findFirst({
    where: { id: caseId, organisationId: orgId },
    include: {
      memorial: {
        select: {
          id:            true,
          qrTokenHash:   true,
          title:         true,
          firstName:     true,
          lastName:      true,
          preferredName: true,
          status:        true,
          workflowStage: true,
          publishedAt:   true,
        },
      },
    },
  });

  if (!funeralCase) notFound();

  const serialisedCase = {
    ...funeralCase,
    serviceDate: funeralCase.serviceDate ? funeralCase.serviceDate.toISOString() : null,
    createdAt:   funeralCase.createdAt.toISOString(),
    updatedAt:   funeralCase.updatedAt.toISOString(),
  };

  // Fetch org memorials that are not yet linked to any case,
  // so the UI can offer them in the "link memorial" picker.
  const unlinkedMemorials = await prisma.memorial.findMany({
    where: {
      organisationId: orgId,
      funeralCase:    null,   // no case linked
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id:            true,
      qrTokenHash:   true,
      title:         true,
      firstName:     true,
      lastName:      true,
      preferredName: true,
    },
    take: 100,
  });

  return (
    <div style={styles.page}>
      <div style={styles.inner}>

        <div style={styles.header}>
          <Link href="/dashboard/cases" style={styles.back}>← Cases</Link>
          <h1 style={styles.title}>
            {funeralCase.deceasedName}
            <span style={styles.ref}> · {funeralCase.caseRef}</span>
          </h1>
        </div>

        <CaseDetail
          initialCase={serialisedCase as any}
          unlinkedMemorials={unlinkedMemorials as any}
        />

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
    maxWidth: '720px',
    margin:   '0 auto',
  },
  header: {
    marginBottom: '1.5rem',
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
  ref: {
    fontWeight:  400,
    color:       'rgba(10,10,22,0.35)',
    fontSize:    '1.1rem',
  },
};

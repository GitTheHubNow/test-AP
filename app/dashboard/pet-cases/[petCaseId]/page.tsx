// app/dashboard/pet-cases/[petCaseId]/page.tsx
//
// Single pet case detail page. Mirrors app/dashboard/cases/[caseId]/page.tsx
// structure — server component fetches the case + stage history, PetCaseDetail
// is the interactive client component.

import { redirect, notFound } from 'next/navigation';
import { auth }               from '@clerk/nextjs/server';
import { prisma }             from '@/lib/prisma';
import { getOrgIdForUser }    from '@/lib/tenant';
import Link                   from 'next/link';
import { PetCaseDetail }      from '@/components/pet-cases/PetCaseDetail';
import { petDisplayName }     from '@/components/pet-cases/petCaseUtils';

interface Props { params: Promise<{ petCaseId: string }> }

export const dynamic = 'force-dynamic';

export default async function PetCaseDetailPage({ params }: Props) {
  const { petCaseId } = await params;

  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const orgId = await getOrgIdForUser(userId).catch(() => null);
  if (!orgId) redirect('/dashboard');

  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { featurePetAftercare: true },
  });
  if (!org?.featurePetAftercare) redirect('/dashboard/pet-cases');

  const petCase = await prisma.petCase.findFirst({
    where: { id: petCaseId, organisationId: orgId },
    include: {
      memorial: {
        select: {
          id: true, qrTokenHash: true, title: true,
          firstName: true, lastName: true, preferredName: true,
          status: true, workflowStage: true, publishedAt: true,
        },
      },
      stageEvents: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!petCase) notFound();

  const serialised = {
    ...petCase,
    collectedAt: petCase.collectedAt ? petCase.collectedAt.toISOString() : null,
    receivedAt:  petCase.receivedAt  ? petCase.receivedAt.toISOString()  : null,
    readyAt:     petCase.readyAt     ? petCase.readyAt.toISOString()     : null,
    returnedAt:  petCase.returnedAt  ? petCase.returnedAt.toISOString()  : null,
    createdAt:   petCase.createdAt.toISOString(),
    updatedAt:   petCase.updatedAt.toISOString(),
    stageEvents: petCase.stageEvents.map(e => ({ ...e, createdAt: e.createdAt.toISOString() })),
  };

  // Org memorials not yet linked to any pet case (or human case), for the
  // "link an existing memorial" picker — mirrors FuneralCase's equivalent.
  const unlinkedMemorials = await prisma.memorial.findMany({
    where: {
      organisationId: orgId,
      petCase:        null,
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, qrTokenHash: true, title: true,
      firstName: true, lastName: true, preferredName: true,
    },
    take: 100,
  });

  return (
    <div style={styles.page}>
      <div style={styles.inner}>

        <div style={styles.header}>
          <Link href="/dashboard/pet-cases" style={styles.back}>← Pet Cases</Link>
          <h1 style={styles.title}>
            {petDisplayName(petCase)}
            <span style={styles.ref}> · {petCase.caseRef}</span>
          </h1>
        </div>

        <PetCaseDetail
          initialCase={serialised as any}
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
    fontWeight: 400,
    color:      'rgba(10,10,22,0.35)',
    fontSize:   '1.1rem',
  },
};

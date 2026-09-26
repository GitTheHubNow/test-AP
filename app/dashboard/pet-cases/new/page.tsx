// app/dashboard/pet-cases/new/page.tsx
//
// Create a new PetCase. Mirrors app/dashboard/cases/new/page.tsx exactly.

import { redirect }        from 'next/navigation';
import { auth }            from '@clerk/nextjs/server';
import { prisma }          from '@/lib/prisma';
import { getOrgIdForUser } from '@/lib/tenant';
import Link                from 'next/link';
import { NewPetCaseForm }  from '@/components/pet-cases/NewPetCaseForm';

export const dynamic = 'force-dynamic';

export default async function NewPetCasePage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const orgId = await getOrgIdForUser(userId).catch(() => null);
  if (!orgId) redirect('/dashboard');

  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { featurePetAftercare: true },
  });

  if (!org?.featurePetAftercare) redirect('/dashboard/pet-cases');

  return (
    <div style={styles.page}>
      <div style={styles.inner}>

        <div style={styles.header}>
          <div>
            <Link href="/dashboard/pet-cases" style={styles.back}>← Pet Cases</Link>
            <h1 style={styles.title}>New Pet Case</h1>
          </div>
        </div>

        <div style={styles.card}>
          <NewPetCaseForm />
        </div>

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
    maxWidth: '560px',
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
    marginBottom:   '0.4rem',
  },
  title: {
    margin:     0,
    fontSize:   '1.4rem',
    fontWeight: 700,
    color:      '#4f5d75',
    fontFamily: 'system-ui, sans-serif',
  },
  card: {
    background:   '#fff',
    borderRadius: '12px',
    boxShadow:    '0 1px 8px rgba(10,10,22,0.07)',
    padding:      '1.75rem 2rem',
  },
};

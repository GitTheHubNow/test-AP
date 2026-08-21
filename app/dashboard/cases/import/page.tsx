// app/dashboard/cases/import/page.tsx
//
// CSV import page for bulk creating FuneralCases.
// Server component shell — CsvImportForm handles all interaction.

import { redirect }        from 'next/navigation';
import { auth }            from '@clerk/nextjs/server';
import { prisma }          from '@/lib/prisma';
import { getOrgIdForUser } from '@/lib/tenant';
import Link                from 'next/link';
import { CsvImportForm }   from '@/components/cases/CsvImportForm';

export const dynamic = 'force-dynamic';

export default async function CsvImportPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const orgId = await getOrgIdForUser(userId).catch(() => null);
  if (!orgId) redirect('/dashboard');

  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { featureCaseLite: true },
  });
  if (!org?.featureCaseLite) redirect('/dashboard/cases');

  return (
    <div style={styles.page}>
      <div style={styles.inner}>

        <div style={styles.header}>
          <Link href="/dashboard/cases" style={styles.back}>← Cases</Link>
          <h1 style={styles.title}>Import cases from CSV</h1>
          <p style={styles.subtitle}>
            Upload a CSV exported from your funeral home software or intake spreadsheet.
            Existing cases with matching reference numbers are skipped automatically.
          </p>
        </div>

        {/* Template download hint */}
        <div style={styles.templateBox}>
          <p style={styles.templateText}>
            <strong>Required columns:</strong> case_ref, deceased_name
            <br />
            <strong>Optional columns:</strong> family_contact, contact_email, contact_phone, service_date, venue, notes
            <br />
            <strong>Date formats accepted:</strong> 17/06/2026 · 2026-06-17 · 17 June 2026
            <br />
            Column names are case-insensitive. Maximum 500 rows per import.
          </p>
          <a
            href="/templates/case-import-template.csv"
            download
            style={styles.templateLink}
          >
            ↓ Download template CSV
          </a>
        </div>

        <div style={styles.card}>
          <CsvImportForm />
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
    maxWidth: '660px',
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
    margin:       '0 0 0.4rem',
    fontSize:     '1.4rem',
    fontWeight:   700,
    color:        '#4f5d75',
    fontFamily:   'system-ui, sans-serif',
  },
  subtitle: {
    margin:     0,
    fontSize:   '0.875rem',
    color:      'rgba(10,10,22,0.5)',
    fontFamily: 'system-ui, sans-serif',
    lineHeight: 1.6,
  },
  templateBox: {
    background:   '#fff',
    border:       '1px solid rgba(10,10,22,0.08)',
    borderRadius: '8px',
    padding:      '1rem 1.25rem',
    marginBottom: '1.25rem',
    display:      'flex',
    justifyContent: 'space-between',
    alignItems:   'flex-start',
    gap:          '1rem',
    flexWrap:     'wrap',
  },
  templateText: {
    margin:     0,
    fontSize:   '0.8rem',
    color:      'rgba(10,10,22,0.55)',
    fontFamily: 'system-ui, sans-serif',
    lineHeight: 1.7,
  },
  templateLink: {
    color:          '#cdba93',
    fontSize:       '0.82rem',
    fontFamily:     'system-ui, sans-serif',
    fontWeight:     600,
    textDecoration: 'none',
    whiteSpace:     'nowrap',
    alignSelf:      'center',
  },
  card: {
    background:   '#fff',
    borderRadius: '12px',
    boxShadow:    '0 1px 8px rgba(10,10,22,0.07)',
    padding:      '1.75rem 2rem',
  },
};

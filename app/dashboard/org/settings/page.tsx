// app/dashboard/org/settings/page.tsx
//
// Organisation settings page — branding section.
// Lives at /dashboard/org/settings alongside /dashboard/products and /dashboard/billing.
//
// Server component: fetches org name for the page header.
// BrandingForm handles all interactive fetching and saving client-side.
//
// Future org-level settings (member management, etc.) can be added as
// additional sections below the branding card.

import { redirect }        from 'next/navigation';
import { auth }            from '@clerk/nextjs/server';
import { prisma }          from '@/lib/prisma';
import { getOrgIdForUser } from '@/lib/tenant';
import { BrandingForm }    from '@/components/org/BrandingForm';
import { TeamSection }     from '@/components/org/TeamSection';

export const dynamic = 'force-dynamic';

export default async function OrgSettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const orgId = await getOrgIdForUser(userId).catch(() => null);
  if (!orgId) redirect('/dashboard');

  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { name: true, isWhiteLabelEnabled: true },
  });

  if (!org) redirect('/dashboard');

  return (
    <div style={styles.page}>
      <div style={styles.inner}>

        {/* ── Page header ── */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Organisation Settings</h1>
            <p style={styles.subtitle}>{org.name}</p>
          </div>
        </div>

        {/* ── Branding card ── */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.cardIconWrap}>
              {/* Simple palette icon via SVG */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="#cdba93" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="13.5" cy="6.5" r=".5" fill="#cdba93"/>
                <circle cx="17.5" cy="10.5" r=".5" fill="#cdba93"/>
                <circle cx="8.5"  cy="7.5"  r=".5" fill="#cdba93"/>
                <circle cx="6.5"  cy="12.5" r=".5" fill="#cdba93"/>
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688
                  0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0
                  0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012
                  17.461 2 12 2z"/>
              </svg>
            </div>
            <div>
              <h2 style={styles.cardTitle}>Branding</h2>
              <p style={styles.cardSubtitle}>
                Configure how your organisation appears on public memorial pages.
              </p>
            </div>
          </div>

          <BrandingForm />
        </div>

        {/* ── Team card ── */}
        <TeamSection />

      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
    marginBottom: '2rem',
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
  card: {
    background:   '#fff',
    borderRadius: '12px',
    boxShadow:    '0 1px 8px rgba(10,10,22,0.07)',
    padding:      '1.75rem 2rem',
    marginBottom: '1.5rem',
  },
  cardHeader: {
    display:      'flex',
    alignItems:   'flex-start',
    gap:          '1rem',
    marginBottom: '1.75rem',
    paddingBottom: '1.25rem',
    borderBottom: '1px solid rgba(10,10,22,0.07)',
  },
  cardIconWrap: {
    width:           '40px',
    height:          '40px',
    background:      '#4f5d75',
    borderRadius:    '8px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  cardTitle: {
    margin:     0,
    fontSize:   '1rem',
    fontWeight: 600,
    color:      '#4f5d75',
    fontFamily: 'system-ui, sans-serif',
    lineHeight: 1.2,
  },
  cardSubtitle: {
    margin:     '0.2rem 0 0',
    fontSize:   '0.82rem',
    color:      'rgba(10,10,22,0.45)',
    fontFamily: 'system-ui, sans-serif',
    lineHeight: 1.5,
  },
};

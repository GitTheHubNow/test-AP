// app/dashboard/products/page.tsx
//
// Org-wide product request fulfilment queue.
// Funeral home staff see all requests across all memorials, filtered by status.
// Each row has a status transition control and a production notes field.
//
// Server component renders the list; OrgProductQueue is a client component
// for the interactive transition controls.

import { redirect }       from 'next/navigation';
import { auth }           from '@clerk/nextjs/server';
import { prisma }         from '@/lib/prisma';
import { getOrgIdForUser } from '@/lib/tenant';
import { OrgProductQueue } from '@/components/products/OrgProductQueue';
import { resolveMemorialFields } from '@/lib/memorial/resolveMemorialFields';

export const dynamic = 'force-dynamic';

export default async function OrgProductsPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const orgId = await getOrgIdForUser(userId).catch(() => null);
  if (!orgId) redirect('/dashboard');

  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { featureProducts: true, name: true },
  });

  if (!org) redirect('/dashboard');

  const featureEnabled = org.featureProducts;

  // Pre-fetch all non-terminal requests server-side for initial render.
  // Client component re-fetches with filters as user interacts.
  const initialRequests = featureEnabled
    ? await prisma.productRequest.findMany({
        where: {
          organisationId: orgId,
          status: { notIn: ['FULFILLED', 'CANCELLED'] },
        },
        orderBy: { requestedAt: 'desc' },
        select: {
          id:              true,
          memorialId:      true,
          productType:     true,
          quantity:        true,
          specifications:  true,
          status:          true,
          quotedPrice:     true,
          requestNotes:    true,
          productionNotes: true,
          requestedAt:     true,
          quotedAt:        true,
          approvedAt:      true,
          completedAt:     true,
          memorial: {
            select: {
              title:         true,
              firstName:     true,
              lastName:      true,
              preferredName: true,
              nominatedName:  true,
              nominatedEmail: true,
              funeralDate:    true,
              venueName:      true,
              venueAddress:   true,
              funeralCase: {
                select: {
                  deceasedName: true, serviceDate: true,
                  familyContact: true, contactEmail: true,
                  venueName: true, venueAddress: true,
                },
              },
            },
          },
        },
      })
    : [];

  // Attach displayName
  const formatted = initialRequests.map(r => {
    const resolved = resolveMemorialFields(r.memorial);
    return {
      ...r,
      memorialName:
        r.memorial.preferredName ||
        [resolved.firstName, resolved.lastName].filter(Boolean).join(' ') ||
        r.memorial.title ||
        'Memorial',
      memorial: undefined,
    };
  });

  return (
    <div style={styles.page}>
      <div style={styles.inner}>

        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Product Queue</h1>
            <p style={styles.subtitle}>{org.name}</p>
          </div>
        </div>

        {!featureEnabled ? (
          <div style={styles.notice}>
            <p style={styles.noticeText}>
              The Products feature is not enabled for your organisation.
              Contact support to enable it.
            </p>
          </div>
        ) : (
          <OrgProductQueue initialRequests={formatted as any} />
        )}

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

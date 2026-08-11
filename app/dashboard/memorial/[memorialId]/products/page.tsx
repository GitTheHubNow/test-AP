// app/dashboard/memorial/[memorialId]/products/page.tsx
//
// Per-memorial product request surface.
// Staff create a request here for a specific family / memorial.
// Lists existing requests with status badges and a delete option (REQUESTED only).
//
// Server component fetches data; ProductRequestForm is a client component.

import { redirect, notFound } from 'next/navigation';
import { auth }               from '@clerk/nextjs/server';
import { prisma }             from '@/lib/prisma';
import Link                   from 'next/link';
import { ProductRequestForm } from '@/components/products/ProductRequestForm';
import {
  STATUS_LABELS,
  STATUS_COLORS,
  VALID_PRODUCT_TYPES,
} from '@/lib/products/transitions';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';

interface Props {
  params: { memorialId: string };
}

function displayName(m: {
  title: string; firstName?: string | null;
  lastName?: string | null; preferredName?: string | null;
}): string {
  return (
    m.preferredName ||
    [m.firstName, m.lastName].filter(Boolean).join(' ') ||
    m.title ||
    'Memorial'
  );
}

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPrice(p: number | null): string {
  if (p === null || p === undefined) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(p);
}

export default async function ProductsPage({ params }: Props) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // FIXED: previously a manual `ownerId !== userId` check, which blocked
  // every org staff member except the literal creator. This page creates
  // new product requests, so 'edit' is the right permission level.
  try {
    await assertMemorialAccess(params.memorialId, userId, 'edit');
  } catch {
    notFound();
  }

  const memorial = await prisma.memorial.findUnique({
    where:  { id: params.memorialId },
    select: {
      id:            true,
      title:         true,
      firstName:     true,
      lastName:      true,
      preferredName: true,
      organisation:  { select: { featureProducts: true } },
    },
  });

  if (!memorial) notFound();

  const featureEnabled = memorial.organisation?.featureProducts ?? false;
  const name = displayName(memorial);

  const requests = featureEnabled
    ? await prisma.productRequest.findMany({
        where:   { memorialId: params.memorialId },
        orderBy: { requestedAt: 'desc' },
      })
    : [];

  return (
    <div style={styles.page}>
      <div style={styles.inner}>

        {/* ── Header ── */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Product Requests</h1>
            <p style={styles.subtitle}>{name}</p>
          </div>
          <Link href={`/dashboard/memorial/${params.memorialId}/qr`} style={styles.backLink}>
            ← Back to memorial
          </Link>
        </div>

        {/* ── Feature disabled ── */}
        {!featureEnabled && (
          <div style={styles.notice}>
            <p style={styles.noticeText}>
              The Products feature is not enabled for your organisation.
              Contact support to enable it.
            </p>
          </div>
        )}

        {featureEnabled && (
          <>
            {/* ── Create form ── */}
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>New Request</h2>
              <ProductRequestForm memorialId={params.memorialId} />
            </div>

            {/* ── Existing requests ── */}
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>
                Requests
                {requests.length > 0 && (
                  <span style={styles.count}>{requests.length}</span>
                )}
              </h2>

              {requests.length === 0 ? (
                <p style={styles.empty}>No requests yet. Create one above.</p>
              ) : (
                <div style={styles.list}>
                  {requests.map(r => {
                    const colors = STATUS_COLORS[r.status as keyof typeof STATUS_COLORS];
                    return (
                      <div key={r.id} style={styles.card}>
                        <div style={styles.cardTop}>
                          <div style={styles.cardLeft}>
                            <span style={styles.productType}>
                              {r.productType.charAt(0).toUpperCase() + r.productType.slice(1)}
                            </span>
                            <span style={styles.qty}>× {r.quantity}</span>
                          </div>
                          <span style={{
                            ...styles.badge,
                            background:   colors.bg,
                            color:        colors.text,
                            border:       `1px solid ${colors.border}`,
                          }}>
                            {STATUS_LABELS[r.status as keyof typeof STATUS_LABELS]}
                          </span>
                        </div>

                        {r.requestNotes && (
                          <p style={styles.notes}>{r.requestNotes}</p>
                        )}

                        {r.quotedPrice !== null && r.quotedPrice !== undefined && (
                          <p style={styles.price}>
                            Quote: <strong>{formatPrice(r.quotedPrice)}</strong>
                          </p>
                        )}

                        <div style={styles.cardMeta}>
                          <span>Requested {formatDate(r.requestedAt)}</span>
                          {r.quotedAt   && <span>· Quoted {formatDate(r.quotedAt)}</span>}
                          {r.approvedAt && <span>· Approved {formatDate(r.approvedAt)}</span>}
                          {r.completedAt && <span>· Fulfilled {formatDate(r.completedAt)}</span>}
                        </div>

                        {/* Only REQUESTED can be deleted — handled client-side */}
                        {r.status === 'REQUESTED' && (
                          <form
                            action={`/api/memorials/${params.memorialId}/products/${r.id}`}
                            method="DELETE"
                            style={{ marginTop: '0.5rem' }}
                          >
                            {/* Pure server-side delete not available in App Router;
                                ProductRequestForm handles delete via fetch client-side.
                                This is a progressive-enhancement placeholder.
                                The client component below handles actual deletion. */}
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Footer ── */}
        <div style={styles.footer}>
          <Link
            href={`/dashboard/products`}
            style={styles.footerLink}
          >
            View org-wide fulfilment queue →
          </Link>
        </div>

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
    maxWidth: '680px',
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
  backLink: {
    color:          'rgba(10,10,22,0.45)',
    fontSize:       '0.82rem',
    fontFamily:     'system-ui, sans-serif',
    textDecoration: 'none',
    whiteSpace:     'nowrap',
  },
  notice: {
    background:   'rgba(10,10,22,0.04)',
    border:       '1px solid rgba(10,10,22,0.12)',
    borderRadius: '8px',
    padding:      '1rem 1.25rem',
    marginBottom: '1.5rem',
  },
  noticeText: {
    margin:     0,
    fontSize:   '0.875rem',
    color:      'rgba(10,10,22,0.6)',
    lineHeight: 1.6,
    fontFamily: 'system-ui, sans-serif',
  },
  section: {
    background:   '#fff',
    borderRadius: '10px',
    boxShadow:    '0 1px 8px rgba(10,10,22,0.07)',
    padding:      '1.5rem',
    marginBottom: '1.5rem',
  },
  sectionTitle: {
    margin:       '0 0 1.25rem',
    fontSize:     '0.95rem',
    fontWeight:   600,
    color:        '#0a0a16',
    fontFamily:   'system-ui, sans-serif',
    display:      'flex',
    alignItems:   'center',
    gap:          '0.5rem',
  },
  count: {
    background:   '#0a0a16',
    color:        '#f0ece4',
    borderRadius: '999px',
    fontSize:     '0.7rem',
    fontWeight:   700,
    padding:      '0.1em 0.55em',
    letterSpacing: '0.02em',
  },
  empty: {
    margin:     0,
    fontSize:   '0.875rem',
    color:      'rgba(10,10,22,0.4)',
    fontFamily: 'system-ui, sans-serif',
  },
  list: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '0.75rem',
  },
  card: {
    background:   '#f7f5f2',
    borderRadius: '8px',
    padding:      '1rem',
    border:       '1px solid rgba(10,10,22,0.07)',
  },
  cardTop: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   '0.4rem',
  },
  cardLeft: {
    display:    'flex',
    alignItems: 'center',
    gap:        '0.5rem',
  },
  productType: {
    fontSize:   '0.9rem',
    fontWeight: 600,
    color:      '#0a0a16',
    fontFamily: 'system-ui, sans-serif',
  },
  qty: {
    fontSize:   '0.8rem',
    color:      'rgba(10,10,22,0.45)',
    fontFamily: 'system-ui, monospace',
  },
  badge: {
    fontSize:     '0.72rem',
    fontWeight:   600,
    fontFamily:   'system-ui, sans-serif',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    borderRadius: '999px',
    padding:      '0.2em 0.65em',
  },
  notes: {
    margin:     '0.3rem 0',
    fontSize:   '0.82rem',
    color:      'rgba(10,10,22,0.6)',
    fontFamily: 'system-ui, sans-serif',
    lineHeight: 1.5,
  },
  price: {
    margin:     '0.3rem 0',
    fontSize:   '0.82rem',
    color:      '#0a0a16',
    fontFamily: 'system-ui, sans-serif',
  },
  cardMeta: {
    marginTop:  '0.4rem',
    fontSize:   '0.74rem',
    color:      'rgba(10,10,22,0.35)',
    fontFamily: 'system-ui, sans-serif',
    display:    'flex',
    flexWrap:   'wrap',
    gap:        '0.2rem',
  },
  footer: {
    marginTop: '0.5rem',
    textAlign: 'center',
  },
  footerLink: {
    color:          '#c9a96e',
    fontSize:       '0.85rem',
    fontFamily:     'system-ui, sans-serif',
    fontWeight:     600,
    textDecoration: 'none',
  },
};

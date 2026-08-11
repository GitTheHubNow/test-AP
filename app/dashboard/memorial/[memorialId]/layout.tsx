// app/dashboard/memorial/[memorialId]/layout.tsx

import { ReactNode }  from 'react';
import Link           from 'next/link';
import { notFound }   from 'next/navigation';
import { auth }       from '@clerk/nextjs/server';
import { prisma }     from '@/lib/prisma';
import { ensurePublicToken } from '@/lib/qr';

interface Props {
  children: ReactNode;
  params:   { memorialId: string };
}

async function getBadgeCounts(memorialId: string) {
  const [unreviewedPhotos, pendingGuestBook] = await Promise.all([
    prisma.collectionItem.count({
      where: { memorialId, status: 'UNSORTED' },
    }).catch(() => 0),
    prisma.guestBookEntry.count({
      where: { memorialId, status: 'PENDING' },
    }).catch(() => 0),
  ]);
  return { unreviewedPhotos, pendingGuestBook };
}

export default async function MemorialLayout({ children, params }: Props) {
  const { userId } = await auth();
  if (!userId) return null;

  const memorial = await prisma.memorial.findFirst({
    where:  { id: params.memorialId },
    select: {
      id: true, firstName: true, lastName: true, serviceTime: true,
      slug: true, publicToken: true,
      organisation: { select: { featureProducts: true, featureSlideshow: true } },
    },
  });
  if (!memorial) notFound();

  // publicToken is generated lazily (see app/api/memorials/[id]/qr/route.ts) —
  // a memorial whose QR panel has never been opened will have publicToken: null.
  // ensurePublicToken generates and persists one if missing, so the sidebar
  // "View public page" link is never broken.
  const publicToken = await ensurePublicToken(params.memorialId, memorial.publicToken);
  const publicHref = `/v/${memorial.slug ?? params.memorialId}?key=${publicToken}`;

  const { unreviewedPhotos, pendingGuestBook } = await getBadgeCounts(params.memorialId);
  const id   = params.memorialId;
  const name = [memorial.firstName, memorial.lastName].filter(Boolean).join(' ') || 'Memorial';

  const navItems = [
    // Collection was previously reachable only via conditional links buried
    // inside the Slideshow empty-state and Preview "add photos" prompts —
    // no entry in the primary sidebar nav at all, despite being the actual
    // entry point for generating family upload invite links and gathering
    // content, which logically comes before Photos (reviewing/sorting what's
    // been collected). Added here as a first-class nav item, placed first
    // since it's the natural starting point for a brand-new memorial.
    { href: `/dashboard/memorial/${id}/collection`, label: 'Collection',      icon: '📥',  badge: 0                 },
    { href: `/dashboard/memorial/${id}/photos`,    label: 'Photos',            icon: '🖼',  badge: unreviewedPhotos  },
    { href: `/dashboard/memorial/${id}/video`,     label: 'Tribute Video',     icon: '🎬',  badge: 0                 },
    { href: `/dashboard/memorial/${id}/guestbook`, label: 'Guest Book',        icon: '📖',  badge: pendingGuestBook  },
    { href: `/dashboard/memorial/${id}/preview`,   label: 'Preview & Publish', icon: '👁',  badge: 0                 },
    { href: `/dashboard/memorial/${id}/appearance`,label: 'Appearance',        icon: '🎨',  badge: 0                 },
    { href: `/dashboard/memorial/${id}/analytics`, label: 'Analytics',         icon: '📊',  badge: 0                 },
    { href: `/dashboard/memorial/${id}/qr`,        label: 'QR Codes',          icon: '⬛',  badge: 0                 },
    ...(memorial.organisation?.featureSlideshow
      ? [{ href: `/dashboard/memorial/${id}/slideshow`, label: 'Slideshow', icon: '🎞', badge: 0 }]
      : []),
    // Products tab is feature-flagged per org — page itself already
    // checks memorial.organisation.featureProducts, but the layout never
    // fetched the flag, so the tab could never be shown even for orgs
    // that have it enabled. Fixed by fetching it above.
    ...(memorial.organisation?.featureProducts
      ? [{ href: `/dashboard/memorial/${id}/products`, label: 'Products', icon: '📦', badge: 0 }]
      : []),
    { href: `/dashboard/memorial/${id}/settings`,  label: 'Settings',          icon: '⚙',  badge: 0                 },
    { href: `/dashboard/memorial/${id}/handover`,  label: 'Handover',          icon: '🤝',  badge: 0                 },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a16' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: '220px', flexShrink: 0,
        background: '#0d0c1e', borderRight: '1px solid #1e1e38',
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}>

        {/* Back */}
        <div style={{ padding: '1rem 1rem 0.75rem', borderBottom: '1px solid #1e1e38' }}>
          <Link href="/dashboard/memorials" style={{
            fontSize: '0.68rem', color: '#5a5870', textDecoration: 'none',
          }}>
            ← All Memorials
          </Link>
        </div>

        {/* Memorial name */}
        <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid #1e1e38' }}>
          <p style={{ margin: '0 0 0.3rem', fontSize: '0.6rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#c9a96e', fontFamily: 'Georgia, serif' }}>
            Memorial
          </p>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#f5f0e8', fontFamily: 'Georgia, serif', lineHeight: 1.3 }}>
            {name}
          </p>
          {memorial.serviceTime && (
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.65rem', color: '#5a5870' }}>
              {new Date(memorial.serviceTime).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>

        {/* Nav */}
        <nav style={{ padding: '0.75rem 0.5rem', flex: 1 }}>
          {navItems.map(item => (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none', display: 'block', marginBottom: 2 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.55rem 0.75rem', borderRadius: 6,
                color: '#8a8aaa', fontSize: '0.78rem',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem' }}>{item.icon}</span>
                  {item.label}
                </span>
                {item.badge > 0 && (
                  <span style={{
                    background: '#c9a96e', color: '#0a0a1a',
                    fontSize: '0.6rem', fontWeight: 700,
                    padding: '0.1rem 0.4rem', borderRadius: 999,
                    minWidth: 16, textAlign: 'center' as const,
                  }}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </nav>

        {/* Public page */}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #1e1e38' }}>
          <Link href={publicHref} target="_blank"
            style={{ fontSize: '0.68rem', color: '#c9a96e', textDecoration: 'none' }}>
            View public page ↗
          </Link>
        </div>
      </aside>

      {/* ── Content ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

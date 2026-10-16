// app/dashboard/memorial/[memorialId]/layout.tsx

import { ReactNode }  from 'react';
import Link           from 'next/link';
import { notFound }   from 'next/navigation';
import { auth }       from '@clerk/nextjs/server';
import { prisma }     from '@/lib/prisma';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { ensurePublicToken } from '@/lib/qr';
import { isTributeUnlocked, daysUntilTributeUnlock } from '@/lib/memorial/journeyGate';
import { resolveMemorialFields } from '@/lib/memorial/resolveMemorialFields';

interface Props {
  children: ReactNode;
  params:   Promise<{ memorialId: string }>;
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
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) return null;

  // ACCESS CHECK — this layout loads names, funeral date, venue and the family
  // contact's name/email for ANY memorialId it is given, and wraps every page
  // below it. Without this, any signed-in user of any funeral home who knew an
  // ID got that data rendered around a "not found" page (each child page
  // checks access for itself, but the layout renders regardless).
  //
  // allowAfterHandover: this layout also wraps the handover page, which staff
  // must still reach to resend or revoke the family's access card. Every
  // CONTENT page below checks access for itself without that option, so
  // handed-over content stays closed to staff.
  try {
    await assertMemorialAccess(memorialId, userId, 'read', { allowAfterHandover: true });
  } catch {
    notFound();
  }

  const memorial = await prisma.memorial.findFirst({
    where:  { id: memorialId },
    select: {
      id: true, firstName: true, lastName: true, serviceTime: true,
      slug: true, publicToken: true,
      funeralDate: true, tributeUnlockOverride: true,
      // PRIORITY 3 FIX: funeralDate here doesn't just affect display —
      // it feeds the lock/unlock gate below (isTributeUnlocked /
      // daysUntilTributeUnlock) that decides whether staff can even
      // access Photos/Video/Guest Book yet. A stale value on a
      // case-linked memorial could lock staff out of (or into) those
      // sections at the wrong time, not just show the wrong date.
      nominatedName:  true,
      nominatedEmail: true,
      venueName:      true,
      venueAddress:   true,
      funeralCase: {
        select: {
          deceasedName: true, serviceDate: true,
          familyContact: true, contactEmail: true,
          venueName: true, venueAddress: true,
        },
      },
      organisation: { select: { featureProducts: true, featureSlideshow: true } },
    },
  });
  if (!memorial) notFound();

  const resolved = resolveMemorialFields(memorial);

  // publicToken is generated lazily (see app/api/memorials/[id]/qr/route.ts) —
  // a memorial whose QR panel has never been opened will have publicToken: null.
  // ensurePublicToken generates and persists one if missing, so the sidebar
  // "View public page" link is never broken.
  const publicToken = await ensurePublicToken(memorialId, memorial.publicToken);
  const publicHref = `/v/${memorial.slug ?? memorialId}?key=${publicToken}`;

  const { unreviewedPhotos, pendingGuestBook } = await getBadgeCounts(memorialId);
  const id   = memorialId;
  const name = [resolved.firstName, resolved.lastName].filter(Boolean).join(' ') || 'Memorial';

  const sectionsUnlocked = isTributeUnlocked({
    funeralDate: resolved.funeralDate,
    tributeUnlockOverride: memorial.tributeUnlockOverride,
  });
  const daysUntilUnlock = daysUntilTributeUnlock({
    funeralDate: resolved.funeralDate,
    tributeUnlockOverride: memorial.tributeUnlockOverride,
  });
  const unlockNote = daysUntilUnlock !== null
    ? (daysUntilUnlock === 0 ? 'Unlocks today' : `Unlocks in ${daysUntilUnlock} day${daysUntilUnlock === 1 ? '' : 's'}`)
    : 'Set a service date to unlock';

  const navItems = [
    // Collection was previously reachable only via conditional links buried
    // inside the Slideshow empty-state and Preview "add photos" prompts —
    // no entry in the primary sidebar nav at all, despite being the actual
    // entry point for generating family upload invite links and gathering
    // content, which logically comes before Photos (reviewing/sorting what's
    // been collected). Added here as a first-class nav item, placed first
    // since it's the natural starting point for a brand-new memorial.
    //
    // Collection is deliberately NEVER locked — it's where the QR code
    // itself is generated and shared, so staff need it reachable from
    // day one to get the memorial started at all.
    //
    // Photos, Tribute Video, and Guest Book unlock together, normally
    // 5 days before the service (see lib/memorial/journeyGate.ts) —
    // staff can open them all early in one go via the override on the
    // locked screen, e.g. a family walks in with a USB stick ready to go.
    { href: `/dashboard/memorial/${id}/collection`, label: 'Collection',      icon: '📥',  badge: 0, locked: false },
    {
      href: `/dashboard/memorial/${id}/photos`, label: 'Photos', icon: '🖼', badge: unreviewedPhotos,
      locked: !sectionsUnlocked, lockedNote: unlockNote,
    },
    {
      href: `/dashboard/memorial/${id}/video`, label: 'Tribute Video', icon: '🎬', badge: 0,
      locked: !sectionsUnlocked, lockedNote: unlockNote,
    },
    {
      href: `/dashboard/memorial/${id}/guestbook`, label: 'Guest Book', icon: '📖', badge: pendingGuestBook,
      locked: !sectionsUnlocked, lockedNote: unlockNote,
    },
    { href: `/dashboard/memorial/${id}/preview`,   label: 'Preview & Publish', icon: '👁',  badge: 0, locked: false },
    { href: `/dashboard/memorial/${id}/appearance`,label: 'Appearance',        icon: '🎨',  badge: 0, locked: false },
    { href: `/dashboard/memorial/${id}/analytics`, label: 'Analytics',         icon: '📊',  badge: 0, locked: false },
    { href: `/dashboard/memorial/${id}/qr`,        label: 'QR Codes',          icon: '⬛',  badge: 0, locked: false },
    ...(memorial.organisation?.featureSlideshow
      ? [{ href: `/dashboard/memorial/${id}/slideshow`, label: 'Slideshow', icon: '🎞', badge: 0, locked: false }]
      : []),
    // Products tab is feature-flagged per org — page itself already
    // checks memorial.organisation.featureProducts, but the layout never
    // fetched the flag, so the tab could never be shown even for orgs
    // that have it enabled. Fixed by fetching it above.
    ...(memorial.organisation?.featureProducts
      ? [{ href: `/dashboard/memorial/${id}/products`, label: 'Products', icon: '📦', badge: 0, locked: false }]
      : []),
    { href: `/dashboard/memorial/${id}/settings`,  label: 'Settings',          icon: '⚙',  badge: 0, locked: false },
    { href: `/dashboard/memorial/${id}/handover`,  label: 'Handover',          icon: '🤝',  badge: 0, locked: false },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#4f5d75' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: '220px', flexShrink: 0,
        background: '#3f4c61', borderRight: '1px solid #5c6a80',
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}>

        {/* Back */}
        <div style={{ padding: '1rem 1rem 0.75rem', borderBottom: '1px solid #5c6a80' }}>
          <Link href="/dashboard/memorials" style={{
            fontSize: '0.68rem', color: '#8290a3', textDecoration: 'none',
          }}>
            ← All Memorials
          </Link>
        </div>

        {/* Memorial name */}
        <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid #5c6a80' }}>
          <p style={{ margin: '0 0 0.3rem', fontSize: '0.6rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#cdba93', fontFamily: 'Georgia, serif' }}>
            Memorial
          </p>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#f4f1ea', fontFamily: 'Georgia, serif', lineHeight: 1.3 }}>
            {name}
          </p>
          {memorial.serviceTime && (
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.65rem', color: '#8290a3' }}>
              {new Date(memorial.serviceTime).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>

        {/* Nav */}
        <nav style={{ padding: '0.75rem 0.5rem', flex: 1 }}>
          {navItems.map(item => {
            if (item.locked) {
              return (
                <div
                  key={item.href}
                  title={item.lockedNote ?? 'Locked'}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.55rem 0.75rem', borderRadius: 6, marginBottom: 2,
                    color: '#5c6a80', fontSize: '0.78rem',
                    cursor: 'not-allowed', opacity: 0.55,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem' }}>{item.icon}</span>
                    {item.label}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    {item.lockedNote && (
                      <span style={{ fontSize: '0.58rem', color: '#7c8aa0', whiteSpace: 'nowrap' }}>
                        {item.lockedNote}
                      </span>
                    )}
                    <span style={{ fontSize: '0.7rem' }}>🔒</span>
                  </span>
                </div>
              );
            }

            return (
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
                      background: '#cdba93', color: '#3f4c61',
                      fontSize: '0.6rem', fontWeight: 700,
                      padding: '0.1rem 0.4rem', borderRadius: 999,
                      minWidth: 16, textAlign: 'center' as const,
                    }}>
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Public page */}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #5c6a80' }}>
          <Link href={publicHref} target="_blank"
            style={{ fontSize: '0.68rem', color: '#cdba93', textDecoration: 'none' }}>
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

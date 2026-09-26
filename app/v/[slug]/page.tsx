// app/v/[slug]/page.tsx
//
// The permanent QR landing page — now on the clean slug URL.
//
// Was app/v/[publicToken]/page.tsx (publicToken directly in the path, no
// separate gate — same trust model as a bearer link). Changed to look up
// by `slug` instead, WITH a required `key` query param (checked against
// publicToken, which still exists and still serves as the real secret)
// per the decision to keep slug (public, readable) and key (private,
// unguessable) as two separate things rather than collapsing to one.
//
// Every QR code printed on a booklet, sign, plaque, or headstone points
// here (as /v/{slug}?key={publicToken}). The URL never changes. The
// experience changes dynamically based on the memorial's qrState — this
// part is completely unchanged from the original file.
//
// PUBLIC — no Clerk auth required. Not in middleware isProtectedRoute list.

import { notFound }       from 'next/navigation';
import { cookies }        from 'next/headers';
import type { Metadata }  from 'next';
import { prisma }         from '@/lib/prisma';
import { resolveTheme }   from '@/lib/theme';
import { computeEffectiveState } from '@/lib/qr/lifecycle';
import { ensurePublicToken } from '@/lib/qr';
import { getPublicUrl }   from '@/lib/upload-shared';
import { MemorialShell }  from '@/components/shell/MemorialShell';
import { MemorialGate }   from '@/components/memorial/MemorialGate';
import { MemorialPageClient } from '@/components/memorial/MemorialPageClient';
import { CulturalWarning }    from '@/components/memorial/CulturalWarning';
import { resolveMemorialFields } from '@/lib/memorial/resolveMemorialFields';
import {
  PamphletView,
  WaitingView,
  MemorialOpenView,
  PrivateView,
  ArchivedView,
} from '@/components/qr/experiences';
import type { MemorialPublicData, QRState } from '@/types/v2';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

interface Props {
  // Next.js 16: params and searchParams are now Promises — see
  // https://nextjs.org/docs/app/guides/upgrading/version-15#params--searchparams
  // The upgrade codemod (@next/codemod upgrade) reported this project as
  // "already on target version" and skipped its actual code transforms
  // (it only checked the package.json version, not whether the code had
  // been migrated) — so every usage in this file needed the same fix
  // applied by hand instead of automatically.
  params:       Promise<{ slug: string }>;
  searchParams: Promise<{ key?: string }>;
}

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year — matches the unlock route

export default async function QrLandingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { key }  = await searchParams;

  const memorial = await prisma.memorial.findFirst({
    where: { slug },
    select: {
      id:                true,
      firstName:         true,
      lastName:          true,
      preferredName:     true,
      birthDate:         true,
      deathDate:         true,
      description:       true,
      publicToken:       true,   // now the GATE SECRET, not the URL itself
      qrState:           true,
      serviceStartAt:    true,
      unlockAt:          true,
      pamphletEnabled:   true,
      pamphletTitle:     true,
      pamphletMessage:   true,
      pamphletVenueNote: true,
      serviceType:       true,
      serviceTime:       true,
      funeralDate:       true,
      venueName:         true,
      venueAddress:      true,
      placeOfPassing:    true,
      status:            true,
      readOnly:          true,
      sealed:            true,
      organisationId:    true,
      title:             true, // for the gate's display heading only
      // PRIORITY 3 FIX: nominatedName/nominatedEmail are required by
      // resolveMemorialFields()'s input shape even though this public
      // page never displays them — the resolver returns a single
      // resolved bundle (name/date/venue) covering all case-linked
      // fields together, so partial input isn't possible. funeralCase
      // itself is what actually matters here: firstName/lastName/
      // funeralDate/venueName/venueAddress below are the exact fields
      // that go stale on a case-linked memorial once staff edit the
      // case instead of the memorial (see resolveMemorialFields.ts) —
      // and this is the permanent public page every printed QR code
      // points to, so a stale name/venue/date here is publicly visible.
      nominatedName:     true,
      nominatedEmail:    true,
      funeralCase: {
        select: {
          deceasedName:  true,
          serviceDate:   true,
          familyContact: true,
          contactEmail:  true,
          venueName:     true,
          venueAddress:  true,
        },
      },
      // ── ADDED: needed to render full memorial content for MEMORIAL_OPEN
      // and to check the cultural warning flags (previously only fetched
      // by the now-deleted app/[slug]/page.tsx, which this route replaces).
      heroImageKey:           true,
      isAboriginal:           true,
      isTorresStraitIslander: true,
      isSouthSeaIslander:     true,
      isMaori:                true,
      settings: {
        select: {
          primaryColor:    true,
          showGallery:     true,
          showGuestBook:   true,
          guestBookTitle:  true,
          guestBookPrompt: true,
          theme:           true,
          heroLayout:      true,
          fontFamily:      true,
        },
      },
      tributeVideo: {
        where:  { showOnMemorial: true, status: 'COMPLETE' },
        select: { webBlobKey: true, hdBlobKey: true, videoQrToken: true },
      },
    },
  });

  // 404 for unknown slugs or non-active memorials — same as before, no
  // change to this behaviour.
  if (!memorial || memorial.status !== 'ACTIVE') {
    return notFound();
  }

  // ── Lazily generate publicToken if missing ────────────────────────────
  // ensurePublicToken (lib/qr.ts) is the single canonical implementation —
  // previously duplicated inline here and in several other call sites
  // during the /m/ → /v/ migration.
  const publicToken = await ensurePublicToken(memorial.id, memorial.publicToken);

  // ── Access gate ─────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const cookieName = `memorial_unlock_${memorial.id}`;
  const hasValidCookie = cookieStore.get(cookieName)?.value === publicToken;
  const hasValidKey = key === publicToken;

  if (!hasValidCookie && !hasValidKey) {
    return <MemorialGate slug={slug} memorialId={memorial.id} memorialTitle={memorial.title} />;
  }

  // needsCookieSet is handled client-side by MemorialGate itself now (it
  // calls /api/memorial-access/unlock directly on submit) — see that
  // component. Arriving here with a valid key but no cookie yet (e.g. a
  // freshly-scanned QR code before the cookie-setting fetch has run) is
  // fine: this render still succeeds because hasValidKey alone is
  // sufficient, and the client-side effect below sets the cookie for
  // next time without blocking this render.
  const needsCookieSet = hasValidKey && !hasValidCookie;

  const theme = await resolveTheme(memorial.organisationId);

  const effectiveState: QRState = computeEffectiveState({
    qrState:        memorial.qrState,
    serviceStartAt: memorial.serviceStartAt,
    unlockAt:       memorial.unlockAt,
  });

  // ── MEMORIAL_OPEN: full memorial content ──────────────────────────────
  // Previously served by the separate app/[slug]/page.tsx (now deleted —
  // merged in here so /v/[slug] is the single, self-contained public
  // route rather than MemorialOpenView linking out to a second page).
  // Fetched only for this state — the lighter lifecycle states above
  // (gate, pamphlet, waiting, private, archived) never need this data,
  // so no point paying for three extra queries on every visit.
  if (effectiveState === 'MEMORIAL_OPEN') {
    const photos = await prisma.collectionItem.findMany({
      where: {
        memorialId:  memorial.id,
        type:        'PHOTO',
        forMemorial: true,
        status:      'APPROVED',
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, blobKey: true, caption: true, isHero: true },
    });

    const guestBookEntries = await prisma.guestBookEntry.findMany({
      where:   { memorialId: memorial.id, status: 'APPROVED' },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take:    50,
      select: {
        id:         true,
        authorName: true,
        message:    true,
        location:   true,
        pinned:     true,
        createdAt:  true,
      },
    });

    const memories = await prisma.memory.findMany({
      where:   { memorialId: memorial.id, status: 'APPROVED' },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      take:    50,
      select: {
        id:         true,
        authorName: true,
        message:    true,
        createdAt:  true,
        featured:   true,
      },
    });

    const hasCulturalWarning =
      memorial.isAboriginal ||
      memorial.isTorresStraitIslander ||
      memorial.isSouthSeaIslander ||
      memorial.isMaori;

    // PRIORITY 3 FIX: resolve once here rather than reading
    // memorial.firstName/lastName/funeralDate/venueName/venueAddress
    // raw — for a case-linked memorial, the case is the source of
    // truth for these fields (see resolveMemorialFields.ts).
    const resolved = resolveMemorialFields(memorial);

    const displayName =
      memorial.preferredName ||
      (resolved.firstName && resolved.lastName
        ? `${resolved.firstName} ${resolved.lastName}`
        : memorial.title);

    const heroUrl = memorial.heroImageKey
      ? getPublicUrl(memorial.heroImageKey)
      : photos.find(p => p.isHero)?.blobKey
        ? getPublicUrl(photos.find(p => p.isHero)!.blobKey!)
        : photos[0]?.blobKey
          ? getPublicUrl(photos[0].blobKey)
          : null;

    const videoUrl = memorial.tributeVideo?.webBlobKey
      ? getPublicUrl(memorial.tributeVideo.webBlobKey)
      : null;

    const serialised = {
      id:             memorial.id,
      // MemorialPageClient's Memorial interface still requires `token`
      // (originally the /m/[token] path segment). This route has no
      // equivalent path-token — access is via publicToken as a query
      // param instead — so slug is passed here purely to satisfy the
      // shared type. Not used for any access-control logic.
      token:          slug,
      slug:           slug,
      publicToken,    // passed to client so it can call the unlock-cookie route
      needsCookieSet,
      displayName,
      firstName:      resolved.firstName,
      lastName:       resolved.lastName,
      birthDate:      memorial.birthDate?.toISOString()   ?? null,
      deathDate:      memorial.deathDate?.toISOString()   ?? null,
      description:    memorial.description                ?? null,
      heroUrl,
      serviceType:    memorial.serviceType   ?? null,
      serviceTime:    memorial.serviceTime?.toISOString() ?? null,
      venueName:      resolved.venueName     ?? null,
      venueAddress:   resolved.venueAddress  ?? null,
      placeOfPassing: memorial.placeOfPassing ?? null,
      videoUrl,
      settings: {
        primaryColor:    memorial.settings?.primaryColor    ?? null,
        showGallery:     memorial.settings?.showGallery     ?? true,
        showGuestBook:   memorial.settings?.showGuestBook   ?? true,
        guestBookTitle:  memorial.settings?.guestBookTitle  ?? null,
        guestBookPrompt: memorial.settings?.guestBookPrompt ?? null,
        theme:           memorial.settings?.theme           ?? 'light',
        heroLayout:      memorial.settings?.heroLayout      ?? 'full-bleed',
        fontFamily:      memorial.settings?.fontFamily      ?? 'serif',
      },
      photos: photos.map(p => ({
        id:      p.id,
        url:     p.blobKey ? getPublicUrl(p.blobKey) : null,
        caption: p.caption ?? null,
      })),
      guestBookEntries: guestBookEntries.map(e => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
      memories: memories.map(m => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      })),
    };

    // Cultural warning renders standalone (its own full-page layout,
    // own background) — deliberately NOT wrapped in MemorialShell, same
    // as the original app/[slug]/page.tsx behaviour. It renders
    // MemorialPageClient itself once acknowledged.
    if (hasCulturalWarning) {
      return (
        <CulturalWarning
          displayName={displayName}
          flags={{
            isAboriginal:           memorial.isAboriginal,
            isTorresStraitIslander: memorial.isTorresStraitIslander,
            isSouthSeaIslander:     memorial.isSouthSeaIslander,
            isMaori:                memorial.isMaori,
          }}
          memorial={serialised}
        />
      );
    }

    return <MemorialPageClient memorial={serialised} />;
  }

  // PRIORITY 3 FIX: PamphletView/WaitingView/ArchivedView all read
  // firstName/lastName/funeralDate/venueName/venueAddress off this cast
  // directly (see MemorialPublicData in types/v2.ts) — same stale-field
  // risk as the MEMORIAL_OPEN branch above, since these are exactly the
  // fields a linked case can override. Resolve first, then overlay the
  // resolved values onto the cast object so every consumer of `data`
  // downstream sees the same resolved truth as the rest of the page.
  const resolvedPreOpen = resolveMemorialFields(memorial);
  const data = {
    ...(memorial as unknown as MemorialPublicData),
    firstName:    resolvedPreOpen.firstName,
    lastName:     resolvedPreOpen.lastName,
    funeralDate:  resolvedPreOpen.funeralDate,
    venueName:    resolvedPreOpen.venueName,
    venueAddress: resolvedPreOpen.venueAddress,
  };

  return (
    <MemorialShell theme={theme}>
      {renderExperience(effectiveState, data, theme)}
    </MemorialShell>
  );
}

function renderExperience(
  state:    QRState,
  memorial: MemorialPublicData,
  theme:    Awaited<ReturnType<typeof resolveTheme>>,
) {
  switch (state) {
    case 'PRE_SERVICE':
    case 'SERVICE_ACTIVE':
      return <PamphletView memorial={memorial} theme={theme} />;

    case 'UNLOCK_PENDING':
      return <WaitingView memorial={memorial} theme={theme} />;

    // MEMORIAL_OPEN is handled earlier in QrLandingPage with an early
    // return (full content + cultural warning check) before this function
    // is ever called for that state — see the `if (effectiveState ===
    // 'MEMORIAL_OPEN')` block above. No case needed here for it.

    case 'PRIVATE':
      return <PrivateView theme={theme} />;

    case 'ARCHIVED':
      return <ArchivedView memorial={memorial} theme={theme} />;

    default:
      // Unexpected/future qrState value — MemorialOpenView now serves as
      // a safe fallback ("View Memorial" links to this same page, which
      // will correctly resolve to the MEMORIAL_OPEN branch above on the
      // next request if this fallback is ever actually hit).
      return <MemorialOpenView memorial={memorial} theme={theme} />;
  }
}

// ── SEO metadata ──────────────────────────────────────────────────────────
// Unchanged logic from the original file, just looked up by slug now.
// Still respects privacy — no PII exposed before service, and now also
// implicitly protected by the gate itself (search engines won't have a
// valid key anyway, but the pre-service name-hiding stays as a second
// layer, unchanged).

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  const memorial = await prisma.memorial.findFirst({
    where:  { slug },
    select: {
      firstName:     true,
      lastName:      true,
      preferredName: true,
      qrState:       true,
      status:        true,
      // PRIORITY 3 FIX: same stale-field risk as the main page render —
      // an indexable page title built from a case-linked memorial's own
      // (possibly stale) name columns would show the wrong name in
      // search results / link previews.
      nominatedName:  true,
      nominatedEmail: true,
      funeralDate:    true,
      venueName:      true,
      venueAddress:   true,
      funeralCase: {
        select: {
          deceasedName:  true,
          serviceDate:   true,
          familyContact: true,
          contactEmail:  true,
          venueName:     true,
          venueAddress:  true,
        },
      },
    },
  });

  if (!memorial || memorial.status !== 'ACTIVE') {
    return { title: 'Memorial' };
  }

  const resolved = resolveMemorialFields(memorial);

  const name =
    memorial.preferredName ??
    [resolved.firstName, resolved.lastName].filter(Boolean).join(' ') ??
    'Memorial';

  if (
    memorial.qrState === 'PRE_SERVICE' ||
    memorial.qrState === 'SERVICE_ACTIVE'
  ) {
    return {
      title:  'Service Details',
      robots: 'noindex',
    };
  }

  const isOpen = memorial.qrState === 'MEMORIAL_OPEN';

  return {
    title:       `In Memory of ${name}`,
    description: `Memorial page for ${name}`,
    // Gated pages should never be indexed regardless of state — a
    // search engine crawler will never have a valid key/cookie, so
    // indexing would only ever show the gate, not useful content.
    robots: 'noindex',
  };
}

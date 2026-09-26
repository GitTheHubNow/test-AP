import { notFound } from 'next/navigation';
import { prisma }   from '@/lib/prisma';
import {
  STAGE_LABELS, STAGE_ORDER,
  type PetCaseStage,
} from '@/components/pet-cases/petCaseUtils';

// app/pet-tracker/[token]/page.tsx
//
// Public, no-auth owner tracker page. The direct analog of app/v/[slug]
// and app/upload/[token] for pet aftercare — matches their visual
// language ("Absolute Posterity" masthead, Cormorant Garamond/Georgia
// serif, #faf8f5/#cdba93/#1a1714 palette) rather than the dashboard's
// inline-style convention, since this is what a member of the public
// (the pet's owner) sees, not staff.
//
// Deliberately a server component querying Prisma directly, same as
// those two pages — not a client component fetching
// /api/pet-tracker/[token] over HTTP, which would add an unnecessary
// internal round-trip for a page that has no interactivity to justify
// client-side state.
//
// Read-only. See the API route's own comment for why any future
// "confirm collection option" action belongs in a separate route, not
// bolted onto this page.

interface Props {
  params: Promise<{ token: string }>;
}

function formatDateTime(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default async function PetTrackerPage({ params }: Props) {
  const { token } = await params;

  const petCase = await prisma.petCase.findUnique({
    where:  { trackerToken: token },
    select: {
      petName:      true,
      species:      true,
      breed:        true,
      stage:        true,
      serviceType:  true,
      collectedAt:  true,
      receivedAt:   true,
      readyAt:      true,
      returnedAt:   true,
      createdAt:    true,
      organisation: { select: { name: true, brandName: true, logoUrl: true, primaryColor: true } },
      memorial:     { select: { slug: true, publicToken: true, status: true } },
      stageEvents: {
        orderBy: { createdAt: 'asc' },
        select:  { stage: true, createdAt: true }, // note/createdBy are staff-only, never sent here
      },
    },
  });

  if (!petCase) notFound();

  const orgDisplayName = petCase.organisation.brandName || petCase.organisation.name;
  const accentColor    = petCase.organisation.primaryColor || '#cdba93';
  const currentIndex   = STAGE_ORDER.indexOf(petCase.stage as PetCaseStage);

  // Map each completed/current stage to the timestamp an owner would
  // recognise as "when this happened" — falls back to the stage event's
  // own createdAt if the dedicated milestone column is somehow unset
  // (shouldn't happen given the PATCH route always stamps both together,
  // but a public page should degrade gracefully rather than show nothing).
  const stageTimestamps: Partial<Record<PetCaseStage, Date | null>> = {
    RECEIVED: petCase.collectedAt,
    IN_CARE:  petCase.receivedAt,
    READY:    petCase.readyAt,
    RETURNED: petCase.returnedAt,
  };

  const eventTimeFor = (stage: PetCaseStage): Date | null => {
    const dedicated = stageTimestamps[stage];
    if (dedicated) return dedicated;
    const ev = petCase.stageEvents.find(e => e.stage === stage);
    return ev ? ev.createdAt : null;
  };

  const memorialHref = petCase.memorial?.publicToken && petCase.memorial.slug
    ? `/v/${petCase.memorial.slug}?key=${petCase.memorial.publicToken}`
    : null;

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5' }}>
      <div style={{ height: 3, background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }} />

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>

        {/* Header */}
        <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
          {petCase.organisation.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- external, org-supplied logo URL; next/image would need a remotePatterns entry per-org
            <img
              src={petCase.organisation.logoUrl}
              alt={orgDisplayName}
              style={{ maxHeight: 40, maxWidth: 180, marginBottom: '1rem', objectFit: 'contain' }}
            />
          )}
          <p style={{ fontSize: '0.62rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: accentColor, fontFamily: 'Georgia, serif', marginBottom: '1rem' }}>
            {orgDisplayName}
          </p>
          <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(1.75rem, 5vw, 2.75rem)', fontWeight: 400, color: '#1a1714', lineHeight: 1.1, marginBottom: '0.75rem' }}>
            {petCase.petName}'s Journey
          </h1>
          {(petCase.breed || petCase.species) && (
            <p style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', color: '#98a2b3', lineHeight: 1.7 }}>
              {[petCase.breed, petCase.species].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        {/* Progress card */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ede8e0', padding: '2rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '1.5rem' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {STAGE_ORDER.map((stage, i) => {
              const isDone    = i < currentIndex;
              const isCurrent = i === currentIndex;
              const isPending = i > currentIndex;
              const time      = eventTimeFor(stage);

              return (
                <div key={stage} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem' }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: '0.1rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isDone ? accentColor : isCurrent ? '#fff' : '#faf8f5',
                    border: `2px solid ${isDone || isCurrent ? accentColor : '#ede8e0'}`,
                  }}>
                    {isDone && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    {isCurrent && (
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor }} />
                    )}
                  </div>
                  <div>
                    <p style={{
                      margin: 0, fontFamily: 'Georgia, serif', fontSize: '1rem',
                      fontWeight: isCurrent ? 700 : 400,
                      color: isPending ? '#c9c2b8' : '#1a1714',
                    }}>
                      {STAGE_LABELS[stage]}
                    </p>
                    {time && (
                      <p style={{ margin: '0.1rem 0 0', fontFamily: 'Georgia, serif', fontSize: '0.78rem', color: '#b0a898' }}>
                        {formatDateTime(time)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {petCase.serviceType && (
          <p style={{ textAlign: 'center', fontFamily: 'Georgia, serif', fontSize: '0.85rem', color: '#98a2b3', marginBottom: '1.5rem' }}>
            Service: {petCase.serviceType}
          </p>
        )}

        {memorialHref && (
          <div style={{ textAlign: 'center' }}>
            <a
              href={memorialHref}
              style={{
                display: 'inline-block', background: '#1a1714', color: '#faf8f5',
                borderRadius: 10, padding: '0.75rem 1.75rem', fontFamily: 'Georgia, serif',
                fontSize: '0.9rem', textDecoration: 'none',
              }}
            >
              View {petCase.petName}'s memorial →
            </a>
          </div>
        )}

        <p style={{ textAlign: 'center', marginTop: '2.5rem', fontSize: '0.75rem', color: '#c9c2b8', fontFamily: 'Georgia, serif' }}>
          This page updates automatically as {petCase.petName}'s care progresses.
        </p>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import OnboardedBanner from '@/components/dashboard/OnboardedBanner';

interface Memorial {
  id: string;
  firstName: string | null;
  lastName: string | null;
  serviceTime: string | null;
  createdAt: string;
  status: string;
  slug: string | null;
  publicToken: string | null;
}

interface OrgFeatures {
  featureCaseLite:     boolean;
  featurePetAftercare: boolean;
}

function publicHref(memorial: Memorial) {
  // publicToken is generated lazily when the QR panel is first opened.
  // If it hasn't been generated yet, send the operator there instead of
  // a link that would 400 with a missing/null key.
  if (!memorial.publicToken) {
    return `/dashboard/memorial/${memorial.id}/qr`;
  }
  return `/v/${memorial.slug ?? memorial.id}?key=${memorial.publicToken}`;
}

function initials(first: string | null, last: string | null) {
  return [(first ?? '')[0], (last ?? '')[0]].filter(Boolean).join('').toUpperCase() || '?';
}

export default function MemorialsPage() {
  const [memorials, setMemorials] = useState<Memorial[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [features, setFeatures] = useState<OrgFeatures | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/memorials')
      .then(r => r.json())
      .then(d => setMemorials(d.memorials || []))
      .catch(console.error)
      .finally(() => setIsLoading(false));

    fetch('/api/dashboard/org-features')
      .then(r => r.json())
      .then(d => { if (d.success) setFeatures(d.data); })
      .catch(console.error);
  }, []);

  // While features hasn't loaded yet, default to showing the human
  // "Memorials" view (existing behaviour) rather than nothing — avoids a
  // flash of an empty/wrong state for the vast majority of orgs that
  // only have featureCaseLite, and pet-only orgs briefly see the
  // Memorials header for a moment before this resolves, which is
  // harmless since the pet-cases prompt below still renders as soon as
  // features loads.
  const showMemorialsSection = features === null || features.featureCaseLite;
  const showPetPrompt        = features?.featurePetAftercare === true;
  const petOnly              = features !== null && features.featurePetAftercare && !features.featureCaseLite;

  return (
    <div style={{ minHeight: '100vh', background: '#4f5d75', fontFamily: 'Georgia, serif' }}>

      {/* Header */}
      <div style={{ padding: '2rem 2.5rem 1.5rem', borderBottom: '1px solid #5c6a80' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 900 }}>
          <div>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.6rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: '#cdba93' }}>
              Dashboard
            </p>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 300, color: '#f4f1ea', lineHeight: 1.2 }}>
              {petOnly ? 'Pet Cases' : 'Memorials'}
            </h1>
          </div>
          {!petOnly && (
            <Link
              href="/dashboard/memorials/new"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.6rem 1.25rem',
                background: 'rgba(201,169,110,0.12)',
                border: '1px solid rgba(201,169,110,0.35)',
                color: '#cdba93',
                fontFamily: 'Georgia, serif',
                fontSize: '0.82rem',
                textDecoration: 'none',
                borderRadius: 6,
                letterSpacing: '0.04em',
              }}
            >
              + New Memorial
            </Link>
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        <OnboardedBanner />
      </Suspense>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 2.5rem' }}>

        {/* Pet Cases section — shown whenever the org has pet aftercare
            enabled. When it's the org's ONLY case type (petOnly), this is
            the whole page's content, styled as the primary view rather
            than a small card, and the Memorials section below is skipped
            entirely (showMemorialsSection is false in that case). When
            both are enabled, this renders as a compact prompt card above
            the memorials list instead — pet cases have their own full
            page at /dashboard/pet-cases, this is just an entry point. */}
        {showPetPrompt && (
          <div style={{
            background: '#3f4c61', border: '1px solid #5c6a80', borderRadius: 12,
            padding: petOnly ? '3rem 2rem' : '1.5rem 1.75rem',
            textAlign: petOnly ? 'center' : 'left',
            marginBottom: showMemorialsSection ? '2rem' : 0,
            display: petOnly ? 'block' : 'flex',
            alignItems: petOnly ? undefined : 'center',
            justifyContent: petOnly ? undefined : 'space-between',
            gap: '1rem',
          }}>
            <div>
              <p style={{
                margin: petOnly ? '0 0 0.5rem' : '0 0 0.25rem',
                fontSize: petOnly ? '1rem' : '0.9rem',
                color: '#f4f1ea', fontWeight: 300,
              }}>
                🐾 Pet Aftercare
              </p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#8290a3' }}>
                {petOnly
                  ? 'Track pet cases from intake through to a finished memorial.'
                  : 'Manage pet cases separately from human memorials.'}
              </p>
            </div>
            <Link
              href="/dashboard/pet-cases"
              style={{
                display: 'inline-block',
                marginTop: petOnly ? '1.5rem' : 0,
                padding: '0.6rem 1.25rem',
                background: 'rgba(201,169,110,0.12)',
                border: '1px solid rgba(201,169,110,0.35)',
                color: '#cdba93',
                fontFamily: 'Georgia, serif',
                fontSize: '0.82rem',
                textDecoration: 'none',
                borderRadius: 6,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}
            >
              Go to Pet Cases →
            </Link>
          </div>
        )}

        {!showMemorialsSection ? null : (
          <>
        {/* Loading skeletons */}
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{
                background: '#3f4c61', border: '1px solid #5c6a80', borderRadius: 10,
                padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem',
                opacity: 1 - i * 0.2,
              }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#5c6a80', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 13, width: '35%', background: '#5c6a80', borderRadius: 4, marginBottom: 8 }} />
                  <div style={{ height: 10, width: '55%', background: '#4a5568', borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && memorials.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '5rem 2rem',
            border: '1px solid #5c6a80', borderRadius: 12, background: '#3f4c61',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.3 }}>✦</div>
            <p style={{ fontSize: '1rem', color: '#f4f1ea', marginBottom: '0.5rem', fontWeight: 300 }}>
              No memorials yet
            </p>
            <p style={{ fontSize: '0.82rem', color: '#8290a3', marginBottom: '2rem' }}>
              Create your first memorial to begin honouring a life.
            </p>
            <Link
              href="/dashboard/memorials/new"
              style={{
                display: 'inline-block', padding: '0.65rem 1.5rem',
                background: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.35)',
                color: '#cdba93', fontFamily: 'Georgia, serif', fontSize: '0.85rem',
                textDecoration: 'none', borderRadius: 6,
              }}
            >
              Create First Memorial
            </Link>
          </div>
        )}

        {/* Memorials list */}
        {!isLoading && memorials.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {memorials.map(memorial => {
              const name = [memorial.firstName, memorial.lastName].filter(Boolean).join(' ') || 'Unnamed';
              const isActive = memorial.status === 'ACTIVE';
              const isDraft  = memorial.status === 'DRAFT';
              const statusColor = isActive ? '#cdba93' : isDraft ? '#8290a3' : '#6b7890';

              return (
                <div
                  key={memorial.id}
                  style={{
                    background: '#3f4c61',
                    border: '1px solid #5c6a80',
                    borderRadius: 10,
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: 'linear-gradient(135deg, #5c6a80, #5c6a80)',
                    border: '1px solid #5c6a80',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.72rem', fontWeight: 600, color: '#cdba93',
                    letterSpacing: '0.06em', flexShrink: 0,
                  }}>
                    {initials(memorial.firstName, memorial.lastName)}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 0.2rem', fontSize: '0.875rem', color: '#f4f1ea', fontWeight: 400 }}>
                      {name}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#8290a3' }}>
                      {memorial.serviceTime
                        ? new Date(memorial.serviceTime).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
                        : `Created ${new Date(memorial.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
                      }
                    </p>
                  </div>

                  {/* Status */}
                  <span style={{
                    fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: statusColor, flexShrink: 0,
                  }}>
                    {memorial.status.charAt(0) + memorial.status.slice(1).toLowerCase()}
                  </span>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                    <Link
                      href={`/dashboard/memorial/${memorial.id}/photos`}
                      style={{
                        fontSize: '0.72rem', padding: '0.35rem 0.7rem',
                        border: '1px solid #5c6a80', borderRadius: 5,
                        color: '#8a8aaa', textDecoration: 'none',
                      }}
                    >
                      Manage
                    </Link>
                    <Link
                      href={publicHref(memorial)}
                      target="_blank"
                      style={{
                        fontSize: '0.72rem', padding: '0.35rem 0.7rem',
                        border: '1px solid rgba(201,169,110,0.25)', borderRadius: 5,
                        color: '#cdba93', textDecoration: 'none',
                      }}
                    >
                      View ↗
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

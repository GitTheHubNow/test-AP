'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Memorial {
  id: string;
  firstName: string | null;
  lastName: string | null;
  serviceTime: string | null;
  createdAt: string;
  status: string;
  // ── ADDED: needed to build the public /v/{slug}?key=... link.
  slug: string | null;
  publicToken: string | null;
}

function initials(first: string | null, last: string | null) {
  return [(first ?? '')[0], (last ?? '')[0]].filter(Boolean).join('').toUpperCase() || '?';
}

export default function MemorialsPage() {
  const [memorials, setMemorials] = useState<Memorial[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/memorials')
      .then(r => r.json())
      .then(d => setMemorials(d.memorials || []))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a16', fontFamily: 'Georgia, serif' }}>

      {/* Header */}
      <div style={{ padding: '2rem 2.5rem 1.5rem', borderBottom: '1px solid #1e1e38' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 900 }}>
          <div>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.6rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: '#c9a96e' }}>
              Dashboard
            </p>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 300, color: '#f5f0e8', lineHeight: 1.2 }}>
              Memorials
            </h1>
          </div>
          <Link
            href="/dashboard/memorials/new"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.6rem 1.25rem',
              background: 'rgba(201,169,110,0.12)',
              border: '1px solid rgba(201,169,110,0.35)',
              color: '#c9a96e',
              fontFamily: 'Georgia, serif',
              fontSize: '0.82rem',
              textDecoration: 'none',
              borderRadius: 6,
              letterSpacing: '0.04em',
            }}
          >
            + New Memorial
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 2.5rem' }}>

        {/* Loading skeletons */}
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{
                background: '#0d0c1e', border: '1px solid #1e1e38', borderRadius: 10,
                padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem',
                opacity: 1 - i * 0.2,
              }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1e1e38', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 13, width: '35%', background: '#1e1e38', borderRadius: 4, marginBottom: 8 }} />
                  <div style={{ height: 10, width: '55%', background: '#1a1a30', borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && memorials.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '5rem 2rem',
            border: '1px solid #1e1e38', borderRadius: 12, background: '#0d0c1e',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.3 }}>✦</div>
            <p style={{ fontSize: '1rem', color: '#f5f0e8', marginBottom: '0.5rem', fontWeight: 300 }}>
              No memorials yet
            </p>
            <p style={{ fontSize: '0.82rem', color: '#5a5870', marginBottom: '2rem' }}>
              Create your first memorial to begin honouring a life.
            </p>
            <Link
              href="/dashboard/memorials/new"
              style={{
                display: 'inline-block', padding: '0.65rem 1.5rem',
                background: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.35)',
                color: '#c9a96e', fontFamily: 'Georgia, serif', fontSize: '0.85rem',
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
              const statusColor = isActive ? '#c9a96e' : isDraft ? '#5a5870' : '#3a3a5a';

              // publicToken is generated lazily (on first QR panel visit),
              // so a brand-new memorial may not have one yet. Rather than
              // link to a URL that would 404 or show the gate with no way
              // in, route through the QR page in that case — it generates
              // the token server-side and the funeral home can get the
              // real link from there.
              const hasFullLink = memorial.slug && memorial.publicToken;
              const viewHref = hasFullLink
                ? `/v/${memorial.slug}?key=${memorial.publicToken}`
                : `/dashboard/memorial/${memorial.id}/qr`;
              const viewLabel = hasFullLink ? 'View ↗' : 'Get link';

              return (
                <div
                  key={memorial.id}
                  style={{
                    background: '#0d0c1e',
                    border: '1px solid #1e1e38',
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
                    background: 'linear-gradient(135deg, #1e1e38, #2a2a4a)',
                    border: '1px solid #2a2a4a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.72rem', fontWeight: 600, color: '#c9a96e',
                    letterSpacing: '0.06em', flexShrink: 0,
                  }}>
                    {initials(memorial.firstName, memorial.lastName)}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 0.2rem', fontSize: '0.875rem', color: '#f5f0e8', fontWeight: 400 }}>
                      {name}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#5a5870' }}>
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
                        border: '1px solid #2a2a4a', borderRadius: 5,
                        color: '#8a8aaa', textDecoration: 'none',
                      }}
                    >
                      Manage
                    </Link>
                    <Link
                      href={viewHref}
                      target={hasFullLink ? '_blank' : undefined}
                      style={{
                        fontSize: '0.72rem', padding: '0.35rem 0.7rem',
                        border: '1px solid rgba(201,169,110,0.25)', borderRadius: 5,
                        color: '#c9a96e', textDecoration: 'none',
                      }}
                    >
                      {viewLabel}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

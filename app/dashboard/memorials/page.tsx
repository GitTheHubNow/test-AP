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
  // ── ADDED: "needs action" alerts + override state (see
  // app/api/dashboard/memorials/route.ts)
  alerts: { type: string; label: string }[];
  funeralDate: string | null;
  tributeUnlockOverride: boolean;
}

function initials(first: string | null, last: string | null) {
  return [(first ?? '')[0], (last ?? '')[0]].filter(Boolean).join('').toUpperCase() || '?';
}

export default function MemorialsPage() {
  const [memorials, setMemorials] = useState<Memorial[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/memorials')
      .then(r => r.json())
      .then(d => setMemorials(d.memorials || []))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  async function handleUnlockEarly(memorialId: string) {
    setUnlockingId(memorialId);
    try {
      const res = await fetch(`/api/memorial/${memorialId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tributeUnlockOverride: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Could not unlock');
      setMemorials(prev => prev.map(m => m.id === memorialId ? { ...m, tributeUnlockOverride: true } : m));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Could not unlock');
    } finally {
      setUnlockingId(null);
    }
  }

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
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 2.5rem' }}>

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

              // Same 5-day rule as lib/memorial/journeyGate.ts — client-side
              // mirror just to decide whether to show the "Unlock early"
              // button here. The actual gate is still enforced server-side
              // on the Photos/Video/Guest Book pages themselves.
              const sectionsLocked = !memorial.tributeUnlockOverride && (() => {
                if (!memorial.funeralDate) return true;
                const now = new Date(); now.setHours(0,0,0,0);
                const svc = new Date(memorial.funeralDate); svc.setHours(0,0,0,0);
                const daysUntil = Math.round((svc.getTime() - now.getTime()) / 86400000);
                return daysUntil > 5;
              })();

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
                    background: '#3f4c61',
                    border: '1px solid #5c6a80',
                    borderRadius: 10,
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.6rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
                      href={viewHref}
                      target={hasFullLink ? '_blank' : undefined}
                      style={{
                        fontSize: '0.72rem', padding: '0.35rem 0.7rem',
                        border: '1px solid rgba(201,169,110,0.25)', borderRadius: 5,
                        color: '#cdba93', textDecoration: 'none',
                      }}
                    >
                      {viewLabel}
                    </Link>
                  </div>
                  </div>

                  {/* Alerts + override — only rendered when there's something to show */}
                  {(memorial.alerts.length > 0 || sectionsLocked) && (
                    <div style={{
                      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem',
                      paddingTop: '0.6rem', borderTop: '1px solid #5c6a80',
                    }}>
                      {memorial.alerts.map(alert => (
                        <span
                          key={alert.type}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                            fontSize: '0.68rem', padding: '0.25rem 0.6rem', borderRadius: 999,
                            background: 'rgba(205,186,147,0.15)',
                            border: '1px solid rgba(205,186,147,0.4)',
                            color: '#e8c87e',
                          }}
                        >
                          ⚠ {alert.label}
                        </span>
                      ))}

                      {sectionsLocked && (
                        <button
                          onClick={() => handleUnlockEarly(memorial.id)}
                          disabled={unlockingId === memorial.id}
                          style={{
                            marginLeft: memorial.alerts.length > 0 ? 'auto' : 0,
                            fontSize: '0.68rem', padding: '0.28rem 0.65rem', borderRadius: 999,
                            border: '1px solid #cdba93',
                            background: unlockingId === memorial.id ? 'rgba(205,186,147,0.15)' : 'transparent',
                            color: '#cdba93', cursor: unlockingId === memorial.id ? 'default' : 'pointer',
                          }}
                        >
                          {unlockingId === memorial.id ? 'Unlocking…' : '🔓 Unlock Photos/Video/Guest Book early'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

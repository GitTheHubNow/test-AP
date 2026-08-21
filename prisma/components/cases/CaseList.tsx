'use client';

// components/cases/CaseList.tsx
//
// Filterable list of FuneralCases for the org-wide cases page.
// Pre-populated with server-fetched ACTIVE cases; re-fetches on filter change.

import { useState, useCallback } from 'react';
import Link                      from 'next/link';
import { STATUS_COLORS, STATUS_LABELS } from '@/components/cases/caseUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LinkedMemorial {
  id:            string;
  qrTokenHash:   string | null;
  title:         string | null;
  firstName:     string | null;
  lastName:      string | null;
  preferredName: string | null;
  status:        string;
}

interface FuneralCase {
  id:            string;
  caseRef:       string;
  deceasedName:  string;
  familyContact: string | null;
  serviceDate:   string | null;
  venue:         string | null;
  status:        'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  memorialId:    string | null;
  createdAt:     string;
  memorial:      LinkedMemorial | null;
}

interface Props {
  initialCases: FuneralCase[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function memorialDisplayName(m: LinkedMemorial): string {
  return (
    m.preferredName ||
    [m.firstName, m.lastName].filter(Boolean).join(' ') ||
    m.title ||
    'Memorial'
  );
}

const FILTER_OPTIONS = [
  { value: 'ACTIVE',    label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function CaseList({ initialCases }: Props) {
  const [cases,         setCases]         = useState<FuneralCase[]>(initialCases);
  const [statusFilter,  setStatusFilter]  = useState<string>('ACTIVE');
  const [loading,       setLoading]       = useState(false);

  const fetchCases = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/org/cases?status=${status}`);
      const json = await res.json();
      if (json.success) setCases(json.data.cases);
    } catch { /* keep existing */ }
    finally { setLoading(false); }
  }, []);

  function handleFilter(status: string) {
    setStatusFilter(status);
    fetchCases(status);
  }

  return (
    <div>
      {/* Filter tabs */}
      <div style={s.filterRow}>
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => handleFilter(opt.value)}
            style={{
              ...s.filterBtn,
              background:  statusFilter === opt.value ? '#4f5d75' : '#fff',
              color:       statusFilter === opt.value ? '#f0ece4' : 'rgba(10,10,22,0.55)',
              border:      statusFilter === opt.value
                ? '1px solid #4f5d75'
                : '1px solid rgba(10,10,22,0.15)',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <p style={s.loading}>Loading…</p>
      ) : cases.length === 0 ? (
        <div style={s.empty}>
          <p style={s.emptyText}>No {statusFilter.toLowerCase()} cases.</p>
          {statusFilter === 'ACTIVE' && (
            <Link href="/dashboard/cases/new" style={s.emptyLink}>
              Create the first case →
            </Link>
          )}
        </div>
      ) : (
        <div style={s.list}>
          {cases.map(c => {
            const colors = STATUS_COLORS[c.status];
            return (
              <Link
                key={c.id}
                href={`/dashboard/cases/${c.id}`}
                style={s.card}
              >
                <div style={s.cardTop}>
                  <div style={s.cardLeft}>
                    <span style={s.name}>{c.deceasedName}</span>
                    <span style={s.ref}>{c.caseRef}</span>
                  </div>
                  <span style={{
                    ...s.badge,
                    background:  colors.bg,
                    color:       colors.text,
                    border:      `1px solid ${colors.border}`,
                  }}>
                    {STATUS_LABELS[c.status]}
                  </span>
                </div>

                <div style={s.meta}>
                  {c.serviceDate && (
                    <span>Service {formatDate(c.serviceDate)}</span>
                  )}
                  {c.venue && (
                    <span>· {c.venue}</span>
                  )}
                  {c.familyContact && (
                    <span>· {c.familyContact}</span>
                  )}
                </div>

                <div style={s.memorialRow}>
                  {c.memorial ? (
                    <span style={s.memorialLinked}>
                      ✓ Memorial: {memorialDisplayName(c.memorial)}
                    </span>
                  ) : (
                    <span style={s.memorialUnlinked}>No memorial linked</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  filterRow: {
    display:      'flex',
    gap:          '0.5rem',
    marginBottom: '1.25rem',
    flexWrap:     'wrap',
  },
  filterBtn: {
    padding:      '0.35rem 0.9rem',
    borderRadius: '999px',
    fontSize:     '0.8rem',
    fontFamily:   'system-ui, sans-serif',
    fontWeight:   500,
    cursor:       'pointer',
    transition:   'background 0.15s',
  },
  loading: {
    color:      'rgba(10,10,22,0.4)',
    fontSize:   '0.875rem',
    fontFamily: 'system-ui, sans-serif',
  },
  empty: {
    background:   '#fff',
    borderRadius: '10px',
    padding:      '2.5rem',
    textAlign:    'center',
  },
  emptyText: {
    margin:     '0 0 0.75rem',
    color:      'rgba(10,10,22,0.35)',
    fontSize:   '0.875rem',
    fontFamily: 'system-ui, sans-serif',
  },
  emptyLink: {
    color:          '#cdba93',
    fontSize:       '0.85rem',
    fontFamily:     'system-ui, sans-serif',
    fontWeight:     600,
    textDecoration: 'none',
  },
  list: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '0.65rem',
  },
  card: {
    display:        'block',
    background:     '#fff',
    borderRadius:   '10px',
    padding:        '1rem 1.25rem',
    boxShadow:      '0 1px 6px rgba(10,10,22,0.06)',
    border:         '1px solid rgba(10,10,22,0.06)',
    textDecoration: 'none',
    transition:     'box-shadow 0.15s',
  },
  cardTop: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   '0.3rem',
    gap:            '0.5rem',
  },
  cardLeft: {
    display:    'flex',
    alignItems: 'center',
    gap:        '0.6rem',
    flexWrap:   'wrap',
  },
  name: {
    fontSize:   '0.95rem',
    fontWeight: 600,
    color:      '#4f5d75',
    fontFamily: 'system-ui, sans-serif',
  },
  ref: {
    fontSize:     '0.75rem',
    color:        'rgba(10,10,22,0.35)',
    fontFamily:   'monospace, system-ui',
    background:   '#f7f5f2',
    padding:      '0.1em 0.4em',
    borderRadius: '4px',
  },
  badge: {
    fontSize:      '0.68rem',
    fontWeight:    700,
    fontFamily:    'system-ui, sans-serif',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    borderRadius:  '999px',
    padding:       '0.18em 0.6em',
    whiteSpace:    'nowrap',
    flexShrink:    0,
  },
  meta: {
    fontSize:   '0.76rem',
    color:      'rgba(10,10,22,0.4)',
    fontFamily: 'system-ui, sans-serif',
    display:    'flex',
    flexWrap:   'wrap',
    gap:        '0.25rem',
    marginBottom: '0.3rem',
  },
  memorialRow: {
    marginTop: '0.15rem',
  },
  memorialLinked: {
    fontSize:   '0.76rem',
    color:      '#15803d',
    fontFamily: 'system-ui, sans-serif',
  },
  memorialUnlinked: {
    fontSize:   '0.76rem',
    color:      'rgba(10,10,22,0.28)',
    fontFamily: 'system-ui, sans-serif',
    fontStyle:  'italic',
  },
};

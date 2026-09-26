'use client';

// components/pet-cases/PetCaseList.tsx
//
// Filterable list of PetCases for the org-wide pet cases page.
// Mirrors components/cases/CaseList.tsx structure — same filter-tabs +
// card-list pattern — with one addition: a stage badge alongside status,
// since "what stage is this case at" is the primary thing staff scan
// this list for (see the original workflow notes' "what do I need to do
// next" framing).

import { useState, useCallback } from 'react';
import Link                      from 'next/link';
import {
  STATUS_COLORS, STATUS_LABELS,
  STAGE_COLORS, STAGE_LABELS,
  memDisplayName, petDisplayName,
  type CaseStatus, type PetCaseStage,
} from '@/components/pet-cases/petCaseUtils';

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

interface PetCase {
  id:                string;
  caseRef:           string;
  petName:           string;
  species:           string | null;
  breed:             string | null;
  ownerContactName:  string;
  stage:             PetCaseStage;
  status:            CaseStatus;
  serviceType:       string | null;
  memorialId:        string | null;
  createdAt:         string;
  memorial:          LinkedMemorial | null;
}

interface Props {
  initialCases: PetCase[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_FILTER_OPTIONS = [
  { value: 'ACTIVE',    label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function PetCaseList({ initialCases }: Props) {
  const [cases,        setCases]        = useState<PetCase[]>(initialCases);
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [loading,      setLoading]      = useState(false);

  const fetchCases = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/org/pet-cases?status=${status}`);
      const json = await res.json();
      if (json.success) setCases(json.data.petCases);
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
        {STATUS_FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => handleFilter(opt.value)}
            style={{
              ...s.filterBtn,
              background: statusFilter === opt.value ? '#4f5d75' : '#fff',
              color:      statusFilter === opt.value ? '#f0ece4' : 'rgba(10,10,22,0.55)',
              border:     statusFilter === opt.value
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
          <p style={s.emptyText}>No {statusFilter.toLowerCase()} pet cases.</p>
          {statusFilter === 'ACTIVE' && (
            <Link href="/dashboard/pet-cases/new" style={s.emptyLink}>
              Create the first pet case →
            </Link>
          )}
        </div>
      ) : (
        <div style={s.list}>
          {cases.map(c => {
            const statusColors = STATUS_COLORS[c.status];
            const stageColors  = STAGE_COLORS[c.stage];
            return (
              <Link
                key={c.id}
                href={`/dashboard/pet-cases/${c.id}`}
                style={s.card}
              >
                <div style={s.cardTop}>
                  <div style={s.cardLeft}>
                    <span style={s.name}>{petDisplayName(c)}</span>
                    <span style={s.ref}>{c.caseRef}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                    <span style={{
                      ...s.badge,
                      background: stageColors.bg,
                      color:      stageColors.text,
                      border:     `1px solid ${stageColors.border}`,
                    }}>
                      {STAGE_LABELS[c.stage]}
                    </span>
                    {c.status !== 'ACTIVE' && (
                      <span style={{
                        ...s.badge,
                        background: statusColors.bg,
                        color:      statusColors.text,
                        border:     `1px solid ${statusColors.border}`,
                      }}>
                        {STATUS_LABELS[c.status]}
                      </span>
                    )}
                  </div>
                </div>

                <div style={s.meta}>
                  {c.breed && <span>{c.breed}</span>}
                  <span>· Owner: {c.ownerContactName}</span>
                  {c.serviceType && <span>· {c.serviceType}</span>}
                </div>

                <div style={s.memorialRow}>
                  {c.memorial ? (
                    <span style={s.memorialLinked}>
                      ✓ Memorial: {memDisplayName(c.memorial)}
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

// ── Styles — identical to CaseList.tsx's, kept in sync deliberately so
// the two list pages feel like the same product, not two different
// products bolted together ─────────────────────────────────────────────

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
    fontSize:     '0.76rem',
    color:        'rgba(10,10,22,0.4)',
    fontFamily:   'system-ui, sans-serif',
    display:      'flex',
    flexWrap:     'wrap',
    gap:          '0.25rem',
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

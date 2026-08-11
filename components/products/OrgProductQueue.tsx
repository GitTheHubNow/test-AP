'use client';

// components/products/OrgProductQueue.tsx
//
// Org-wide fulfilment queue — interactive client component.
// Renders the pre-fetched list from the server component, then re-fetches
// when the status filter changes or after a transition is applied.

import { useState, useTransition, useCallback } from 'react';
import {
  STATUS_LABELS,
  STATUS_COLORS,
  availableTransitions,
  type ProductRequestStatus,
} from '@/lib/products/transitions';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProductRequest {
  id:              string;
  memorialId:      string;
  memorialName:    string;
  productType:     string;
  quantity:        number;
  specifications:  unknown;
  status:          ProductRequestStatus;
  quotedPrice:     number | null;
  requestNotes:    string | null;
  productionNotes: string | null;
  requestedAt:     string;
  quotedAt:        string | null;
  approvedAt:      string | null;
  completedAt:     string | null;
}

interface Props {
  initialRequests: ProductRequest[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '',           label: 'Active (all)' },
  { value: 'REQUESTED',  label: 'Requested' },
  { value: 'QUOTED',     label: 'Quoted' },
  { value: 'APPROVED',   label: 'Approved' },
  { value: 'FULFILLED',  label: 'Fulfilled' },
  { value: 'CANCELLED',  label: 'Cancelled' },
];

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatPrice(p: number | null): string {
  if (p === null || p === undefined) return '';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(p);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OrgProductQueue({ initialRequests }: Props) {
  const [requests,    setRequests]    = useState<ProductRequest[]>(initialRequests);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [_pending,    startTransition] = useTransition();

  // ── Expanded row state ──────────────────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Transition state per row ────────────────────────────────────────────────
  const [transiting, setTransiting] = useState<Record<string, boolean>>({});
  const [rowError,   setRowError]   = useState<Record<string, string>>({});
  const [quoteInput, setQuoteInput] = useState<Record<string, string>>({});
  const [noteInput,  setNoteInput]  = useState<Record<string, string>>({});
  const [noteSaving, setNoteSaving] = useState<Record<string, boolean>>({});

  // ── Fetch with filter ───────────────────────────────────────────────────────

  const fetchRequests = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const qs = status ? `?status=${status}` : '';
      const res = await fetch(`/api/org/products${qs}`);
      const json = await res.json();
      if (json.success) setRequests(json.data.requests);
    } catch { /* swallow — keep existing data */ }
    finally { setLoading(false); }
  }, []);

  function handleFilterChange(value: string) {
    setStatusFilter(value);
    fetchRequests(value);
  }

  // ── Status transition ───────────────────────────────────────────────────────

  async function handleTransition(
    req: ProductRequest,
    to: ProductRequestStatus,
  ) {
    setTransiting(p => ({ ...p, [req.id]: true }));
    setRowError(p => ({ ...p, [req.id]: '' }));

    const body: Record<string, unknown> = { status: to };

    if (to === 'QUOTED') {
      const price = parseFloat(quoteInput[req.id] ?? '');
      if (isNaN(price) || price <= 0) {
        setRowError(p => ({ ...p, [req.id]: 'Enter a valid quoted price before marking as Quoted.' }));
        setTransiting(p => ({ ...p, [req.id]: false }));
        return;
      }
      body.quotedPrice = price;
    }

    try {
      const res = await fetch(`/api/org/products/${req.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setRowError(p => ({ ...p, [req.id]: json.error ?? 'Update failed' }));
        return;
      }
      // Re-fetch to refresh the list with the current filter
      await fetchRequests(statusFilter);
    } catch (e: any) {
      setRowError(p => ({ ...p, [req.id]: e.message ?? 'Network error' }));
    } finally {
      setTransiting(p => ({ ...p, [req.id]: false }));
    }
  }

  // ── Production notes save ───────────────────────────────────────────────────

  async function saveNotes(req: ProductRequest) {
    setNoteSaving(p => ({ ...p, [req.id]: true }));
    try {
      await fetch(`/api/org/products/${req.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ productionNotes: noteInput[req.id] ?? req.productionNotes ?? '' }),
      });
    } finally {
      setNoteSaving(p => ({ ...p, [req.id]: false }));
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Filter bar */}
      <div style={styles.filterBar}>
        <label style={styles.filterLabel}>Show:</label>
        <div style={styles.filterBtns}>
          {STATUS_FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleFilterChange(opt.value)}
              style={{
                ...styles.filterBtn,
                background: statusFilter === opt.value ? '#0a0a16' : '#fff',
                color:      statusFilter === opt.value ? '#f0ece4' : 'rgba(10,10,22,0.6)',
                border:     statusFilter === opt.value
                  ? '1px solid #0a0a16'
                  : '1px solid rgba(10,10,22,0.18)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <p style={styles.loadingMsg}>Loading…</p>
      ) : requests.length === 0 ? (
        <div style={styles.emptyCard}>
          <p style={styles.emptyText}>No requests match this filter.</p>
        </div>
      ) : (
        <div style={styles.list}>
          {requests.map(req => {
            const colors    = STATUS_COLORS[req.status];
            const available = availableTransitions(req.status);
            const isExpanded = expandedId === req.id;

            return (
              <div key={req.id} style={styles.card}>
                {/* Card header */}
                <div style={styles.cardHeader}>
                  <div style={styles.cardHeaderLeft}>
                    <span style={styles.memorial}>{req.memorialName}</span>
                    <span style={styles.dot}>·</span>
                    <span style={styles.type}>
                      {req.productType.charAt(0).toUpperCase() + req.productType.slice(1)}
                    </span>
                    <span style={styles.qty}>× {req.quantity}</span>
                  </div>
                  <div style={styles.cardHeaderRight}>
                    <span style={{
                      ...styles.badge,
                      background: colors.bg,
                      color:      colors.text,
                      border:     `1px solid ${colors.border}`,
                    }}>
                      {STATUS_LABELS[req.status]}
                    </span>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : req.id)}
                      style={styles.expandBtn}
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? '▲' : '▼'}
                    </button>
                  </div>
                </div>

                {/* Summary line */}
                <div style={styles.meta}>
                  <span>Requested {formatDate(req.requestedAt)}</span>
                  {req.quotedAt    && <span>· Quoted {formatDate(req.quotedAt)}</span>}
                  {req.approvedAt  && <span>· Approved {formatDate(req.approvedAt)}</span>}
                  {req.completedAt && <span>· Fulfilled {formatDate(req.completedAt)}</span>}
                  {req.quotedPrice !== null && req.quotedPrice !== undefined && (
                    <span>· {formatPrice(req.quotedPrice)}</span>
                  )}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={styles.detail}>
                    {req.requestNotes && (
                      <div style={styles.detailSection}>
                        <p style={styles.detailLabel}>Request notes</p>
                        <p style={styles.detailText}>{req.requestNotes}</p>
                      </div>
                    )}

                    {/* Production notes */}
                    <div style={styles.detailSection}>
                      <p style={styles.detailLabel}>Production notes</p>
                      <textarea
                        rows={3}
                        value={noteInput[req.id] ?? req.productionNotes ?? ''}
                        onChange={e => setNoteInput(p => ({ ...p, [req.id]: e.target.value }))}
                        placeholder="Internal notes for fulfilment…"
                        style={styles.noteArea}
                      />
                      <button
                        onClick={() => saveNotes(req)}
                        disabled={noteSaving[req.id]}
                        style={styles.saveNoteBtn}
                      >
                        {noteSaving[req.id] ? 'Saving…' : 'Save notes'}
                      </button>
                    </div>

                    {/* Quote price input (shown when REQUESTED, transitioning to QUOTED) */}
                    {req.status === 'REQUESTED' && (
                      <div style={styles.detailSection}>
                        <p style={styles.detailLabel}>Quoted price (AUD)</p>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={quoteInput[req.id] ?? (req.quotedPrice?.toString() ?? '')}
                          onChange={e => setQuoteInput(p => ({ ...p, [req.id]: e.target.value }))}
                          placeholder="0.00"
                          style={styles.priceInput}
                        />
                      </div>
                    )}

                    {/* Transition buttons */}
                    {available.length > 0 && (
                      <div style={styles.transitionRow}>
                        {available.map(to => (
                          <button
                            key={to}
                            onClick={() => handleTransition(req, to)}
                            disabled={transiting[req.id]}
                            style={{
                              ...styles.transitionBtn,
                              ...(to === 'CANCELLED' ? styles.cancelBtn : styles.advanceBtn),
                              opacity: transiting[req.id] ? 0.6 : 1,
                            }}
                          >
                            {transiting[req.id] ? '…' : `Mark as ${STATUS_LABELS[to]}`}
                          </button>
                        ))}
                      </div>
                    )}

                    {rowError[req.id] && (
                      <p style={styles.rowError}>{rowError[req.id]}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  filterBar: {
    display:     'flex',
    alignItems:  'center',
    gap:         '0.75rem',
    marginBottom: '1.25rem',
    flexWrap:    'wrap',
  },
  filterLabel: {
    fontSize:   '0.8rem',
    fontWeight: 600,
    color:      'rgba(10,10,22,0.5)',
    fontFamily: 'system-ui, sans-serif',
  },
  filterBtns: {
    display: 'flex',
    gap:     '0.4rem',
    flexWrap: 'wrap',
  },
  filterBtn: {
    padding:      '0.3rem 0.75rem',
    borderRadius: '999px',
    fontSize:     '0.78rem',
    fontFamily:   'system-ui, sans-serif',
    fontWeight:   500,
    cursor:       'pointer',
    transition:   'background 0.15s, color 0.15s',
  },
  loadingMsg: {
    color:      'rgba(10,10,22,0.4)',
    fontSize:   '0.875rem',
    fontFamily: 'system-ui, sans-serif',
  },
  emptyCard: {
    background:   '#fff',
    borderRadius: '10px',
    padding:      '2rem',
    textAlign:    'center',
  },
  emptyText: {
    margin:     0,
    color:      'rgba(10,10,22,0.35)',
    fontSize:   '0.875rem',
    fontFamily: 'system-ui, sans-serif',
  },
  list: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '0.75rem',
  },
  card: {
    background:   '#fff',
    borderRadius: '10px',
    padding:      '1.1rem 1.25rem',
    boxShadow:    '0 1px 6px rgba(10,10,22,0.07)',
    border:       '1px solid rgba(10,10,22,0.06)',
  },
  cardHeader: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   '0.25rem',
    gap:            '0.5rem',
    flexWrap:       'wrap',
  },
  cardHeaderLeft: {
    display:    'flex',
    alignItems: 'center',
    gap:        '0.4rem',
    flexWrap:   'wrap',
  },
  cardHeaderRight: {
    display:    'flex',
    alignItems: 'center',
    gap:        '0.5rem',
  },
  memorial: {
    fontSize:   '0.92rem',
    fontWeight: 600,
    color:      '#0a0a16',
    fontFamily: 'system-ui, sans-serif',
  },
  dot: {
    color:      'rgba(10,10,22,0.3)',
    fontSize:   '0.8rem',
  },
  type: {
    fontSize:   '0.85rem',
    color:      'rgba(10,10,22,0.7)',
    fontFamily: 'system-ui, sans-serif',
  },
  qty: {
    fontSize:   '0.78rem',
    color:      'rgba(10,10,22,0.35)',
    fontFamily: 'monospace, system-ui',
  },
  badge: {
    fontSize:      '0.7rem',
    fontWeight:    700,
    fontFamily:    'system-ui, sans-serif',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    borderRadius:  '999px',
    padding:       '0.18em 0.6em',
    whiteSpace:    'nowrap',
  },
  expandBtn: {
    background:   'none',
    border:       'none',
    cursor:       'pointer',
    fontSize:     '0.7rem',
    color:        'rgba(10,10,22,0.4)',
    padding:      '0.2rem 0.3rem',
  },
  meta: {
    fontSize:   '0.74rem',
    color:      'rgba(10,10,22,0.35)',
    fontFamily: 'system-ui, sans-serif',
    display:    'flex',
    flexWrap:   'wrap',
    gap:        '0.2rem',
  },
  detail: {
    marginTop:  '0.85rem',
    paddingTop: '0.85rem',
    borderTop:  '1px solid rgba(10,10,22,0.07)',
  },
  detailSection: {
    marginBottom: '1rem',
  },
  detailLabel: {
    margin:        '0 0 0.3rem',
    fontSize:      '0.73rem',
    fontWeight:    600,
    color:         'rgba(10,10,22,0.4)',
    fontFamily:    'system-ui, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  detailText: {
    margin:     0,
    fontSize:   '0.85rem',
    color:      'rgba(10,10,22,0.65)',
    fontFamily: 'system-ui, sans-serif',
    lineHeight: 1.5,
  },
  noteArea: {
    width:        '100%',
    padding:      '0.5rem 0.7rem',
    border:       '1px solid rgba(10,10,22,0.15)',
    borderRadius: '6px',
    fontSize:     '0.85rem',
    fontFamily:   'system-ui, sans-serif',
    resize:       'vertical',
    lineHeight:   1.5,
    color:        '#0a0a16',
    boxSizing:    'border-box',
    marginBottom: '0.5rem',
  },
  saveNoteBtn: {
    background:   '#f7f5f2',
    border:       '1px solid rgba(10,10,22,0.15)',
    borderRadius: '6px',
    padding:      '0.35rem 0.85rem',
    fontSize:     '0.78rem',
    fontFamily:   'system-ui, sans-serif',
    cursor:       'pointer',
    color:        '#0a0a16',
  },
  priceInput: {
    padding:      '0.45rem 0.7rem',
    border:       '1px solid rgba(10,10,22,0.15)',
    borderRadius: '6px',
    fontSize:     '0.9rem',
    fontFamily:   'system-ui, sans-serif',
    width:        '140px',
    color:        '#0a0a16',
  },
  transitionRow: {
    display:  'flex',
    gap:      '0.5rem',
    flexWrap: 'wrap',
  },
  transitionBtn: {
    border:       'none',
    borderRadius: '6px',
    padding:      '0.45rem 1rem',
    fontSize:     '0.82rem',
    fontWeight:   600,
    fontFamily:   'system-ui, sans-serif',
    cursor:       'pointer',
  },
  advanceBtn: {
    background: '#0a0a16',
    color:      '#f0ece4',
  },
  cancelBtn: {
    background: '#fef2f2',
    color:      '#b91c1c',
    border:     '1px solid #fecaca',
  },
  rowError: {
    marginTop:  '0.5rem',
    color:      '#b91c1c',
    fontSize:   '0.8rem',
    fontFamily: 'system-ui, sans-serif',
  },
};

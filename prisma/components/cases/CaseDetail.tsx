'use client';

// components/cases/CaseDetail.tsx
//
// Full case detail view with inline editing.
// Sections:
//   1. Case details (editable inline)
//   2. Status controls (ACTIVE → COMPLETED | CANCELLED)
//   3. Memorial link (link an existing unlinked memorial, or unlink)
//   4. Danger zone (delete — only when no memorial linked)

import { useState, useTransition } from 'react';
import { useRouter }               from 'next/navigation';
import Link                        from 'next/link';
import {
  STATUS_LABELS,
  STATUS_COLORS,
  memDisplayName,
  formatDate,
  formatDateTime,
  type CaseStatus,
} from '@/components/cases/caseUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LinkedMemorial {
  id:            string;
  qrTokenHash:   string | null;
  title:         string | null;
  firstName:     string | null;
  lastName:      string | null;
  preferredName: string | null;
  status:        string;
  workflowStage: string | null;
  publishedAt:   string | null;
}

interface FuneralCase {
  id:            string;
  caseRef:       string;
  deceasedName:  string;
  familyContact: string | null;
  contactEmail:  string | null;
  contactPhone:  string | null;
  serviceDate:   string | null;
  venue:         string | null;
  status:        CaseStatus;
  notes:         string | null;
  memorialId:    string | null;
  createdAt:     string;
  updatedAt:     string;
  memorial:      LinkedMemorial | null;
}

interface UnlinkedMemorial {
  id:            string;
  title:         string | null;
  firstName:     string | null;
  lastName:      string | null;
  preferredName: string | null;
}

interface Props {
  initialCase:        FuneralCase;
  unlinkedMemorials:  UnlinkedMemorial[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLocalDatetimeValue(iso: string | null): string {
  if (!iso) return '';
  // datetime-local input requires "YYYY-MM-DDTHH:mm"
  return iso.slice(0, 16);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CaseDetail({ initialCase, unlinkedMemorials }: Props) {
  const router  = useRouter();
  const [, startTransition] = useTransition();

  const [c, setC] = useState<FuneralCase>(initialCase);

  // Edit state
  const [editing,       setEditing]       = useState(false);
  const [caseRef,       setCaseRef]       = useState(c.caseRef);
  const [deceasedName,  setDeceasedName]  = useState(c.deceasedName);
  const [familyContact, setFamilyContact] = useState(c.familyContact ?? '');
  const [contactEmail,  setContactEmail]  = useState(c.contactEmail  ?? '');
  const [contactPhone,  setContactPhone]  = useState(c.contactPhone  ?? '');
  const [serviceDate,   setServiceDate]   = useState(toLocalDatetimeValue(c.serviceDate));
  const [venue,         setVenue]         = useState(c.venue  ?? '');
  const [notes,         setNotes]         = useState(c.notes  ?? '');

  // UI state
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [success,       setSuccess]       = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [linking,       setLinking]       = useState(false);
  const [selectedMem,   setSelectedMem]   = useState('');
  const [deleting,      setDeleting]      = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── API helper ──────────────────────────────────────────────────────────────

  async function patch(body: Record<string, unknown>) {
    const res  = await fetch(`/api/org/cases/${c.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error ?? 'Update failed');
    return json.data.case as FuneralCase;
  }

  // ── Save edits ──────────────────────────────────────────────────────────────

  async function handleSave() {
    setError(null);
    if (!caseRef.trim())      { setError('Case reference is required.'); return; }
    if (!deceasedName.trim()) { setError('Deceased name is required.');  return; }
    setSaving(true);
    try {
      const updated = await patch({
        caseRef:       caseRef.trim(),
        deceasedName:  deceasedName.trim(),
        familyContact: familyContact.trim() || null,
        contactEmail:  contactEmail.trim()  || null,
        contactPhone:  contactPhone.trim()  || null,
        serviceDate:   serviceDate          || null,
        venue:         venue.trim()         || null,
        notes:         notes.trim()         || null,
      });
      setC(updated);
      setEditing(false);
      setSuccess('Saved.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    setCaseRef(c.caseRef);
    setDeceasedName(c.deceasedName);
    setFamilyContact(c.familyContact ?? '');
    setContactEmail(c.contactEmail   ?? '');
    setContactPhone(c.contactPhone   ?? '');
    setServiceDate(toLocalDatetimeValue(c.serviceDate));
    setVenue(c.venue  ?? '');
    setNotes(c.notes  ?? '');
    setEditing(false);
    setError(null);
  }

  // ── Status transition ───────────────────────────────────────────────────────

  async function handleStatus(status: CaseStatus) {
    setError(null);
    setTransitioning(true);
    try {
      const updated = await patch({ status });
      setC(updated);
      setSuccess(`Marked as ${STATUS_LABELS[status]}.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTransitioning(false);
    }
  }

  // ── Memorial link ───────────────────────────────────────────────────────────

  async function handleLink() {
    if (!selectedMem) return;
    setError(null);
    setLinking(true);
    try {
      const updated = await patch({ memorialId: selectedMem });
      setC(updated);
      setSelectedMem('');
      setSuccess('Memorial linked.');
      setTimeout(() => setSuccess(null), 3000);
      startTransition(() => router.refresh());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink() {
    setError(null);
    setLinking(true);
    try {
      const updated = await patch({ memorialId: null });
      setC(updated);
      setSuccess('Memorial unlinked.');
      setTimeout(() => setSuccess(null), 3000);
      startTransition(() => router.refresh());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLinking(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      const res  = await fetch(`/api/org/cases/${c.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Delete failed');
      router.push('/dashboard/cases');
    } catch (e: any) {
      setError(e.message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const colors = STATUS_COLORS[c.status];

  return (
    <div style={s.wrap}>

      {/* ── Global feedback ── */}
      {error   && <p style={s.err}>{error}</p>}
      {success && <p style={s.ok}>{success}</p>}

      {/* ── Details card ── */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <h2 style={s.cardTitle}>Details</h2>
          {!editing && c.status === 'ACTIVE' && (
            <button onClick={() => setEditing(true)} style={s.editBtn}>Edit</button>
          )}
        </div>

        {editing ? (
          <div>
            <div style={s.grid}>
              <div style={s.field}>
                <label style={s.label}>Case reference *</label>
                <input value={caseRef} onChange={e => setCaseRef(e.target.value)} style={s.input} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Deceased name *</label>
                <input value={deceasedName} onChange={e => setDeceasedName(e.target.value)} style={s.input} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Family contact</label>
                <input value={familyContact} onChange={e => setFamilyContact(e.target.value)} style={s.input} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Contact email</label>
                <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} style={s.input} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Contact phone</label>
                <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} style={s.input} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Service date</label>
                <input type="datetime-local" value={serviceDate} onChange={e => setServiceDate(e.target.value)} style={s.input} />
              </div>
              <div style={{ ...s.field, gridColumn: '1 / -1' }}>
                <label style={s.label}>Venue</label>
                <input value={venue} onChange={e => setVenue(e.target.value)} style={s.input} />
              </div>
              <div style={{ ...s.field, gridColumn: '1 / -1' }}>
                <label style={s.label}>Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={s.textarea} />
              </div>
            </div>
            <div style={s.editBtns}>
              <button onClick={handleSave} disabled={saving} style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={handleCancelEdit} style={s.cancelBtn}>Cancel</button>
            </div>
          </div>
        ) : (
          <dl style={s.dl}>
            <Row label="Case ref"      value={c.caseRef} mono />
            <Row label="Deceased"      value={c.deceasedName} />
            <Row label="Family contact" value={c.familyContact} />
            <Row label="Email"         value={c.contactEmail} />
            <Row label="Phone"         value={c.contactPhone} />
            <Row label="Service date"  value={formatDateTime(c.serviceDate)} />
            <Row label="Venue"         value={c.venue} />
            <Row label="Notes"         value={c.notes} />
            <Row label="Created"       value={formatDate(c.createdAt)} />
          </dl>
        )}
      </div>

      {/* ── Status card ── */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>Status</h2>
        <div style={s.statusRow}>
          <span style={{
            ...s.badge,
            background: colors.bg,
            color:      colors.text,
            border:     `1px solid ${colors.border}`,
          }}>
            {STATUS_LABELS[c.status]}
          </span>

          {c.status === 'ACTIVE' && (
            <div style={s.transitionBtns}>
              <button
                onClick={() => handleStatus('COMPLETED')}
                disabled={transitioning}
                style={{ ...s.advanceBtn, opacity: transitioning ? 0.6 : 1 }}
              >
                Mark as Completed
              </button>
              <button
                onClick={() => handleStatus('CANCELLED')}
                disabled={transitioning}
                style={{ ...s.cancelStatusBtn, opacity: transitioning ? 0.6 : 1 }}
              >
                Cancel case
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Memorial link card ── */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>Linked memorial</h2>

        {c.memorial ? (
          <div>
            <div style={s.memRow}>
              <div>
                <p style={s.memName}>{memDisplayName(c.memorial)}</p>
                <p style={s.memMeta}>
                  Status: {c.memorial.status}
                  {c.memorial.publishedAt && ` · Published ${formatDate(c.memorial.publishedAt)}`}
                </p>
              </div>
              <div style={s.memActions}>
                {c.memorial.qrTokenHash && (
                  <Link
                    href={`/dashboard/memorial/${c.memorial.id}/qr`}
                    style={s.memLink}
                  >
                    Open memorial →
                  </Link>
                )}
                <button onClick={handleUnlink} disabled={linking} style={s.unlinkBtn}>
                  {linking ? '…' : 'Unlink'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p style={s.noMem}>No memorial linked to this case yet.</p>
            {unlinkedMemorials.length > 0 ? (
              <div style={s.linkRow}>
                <select
                  value={selectedMem}
                  onChange={e => setSelectedMem(e.target.value)}
                  style={s.select}
                >
                  <option value="">Select a memorial…</option>
                  {unlinkedMemorials.map(m => (
                    <option key={m.id} value={m.id}>
                      {memDisplayName(m)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleLink}
                  disabled={!selectedMem || linking}
                  style={{ ...s.linkBtn, opacity: (!selectedMem || linking) ? 0.5 : 1 }}
                >
                  {linking ? 'Linking…' : 'Link'}
                </button>
              </div>
            ) : (
              <p style={s.noMemHint}>
                All memorials are already linked to cases, or no memorials exist yet.{' '}
                <Link href="/dashboard/memorials/new" style={s.inlineLink}>
                  Create a memorial →
                </Link>
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Danger zone ── */}
      {!c.memorialId && c.status !== 'COMPLETED' && (
        <div style={s.danger}>
          <h2 style={s.dangerTitle}>Danger zone</h2>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={s.deleteBtn}>
              Delete case
            </button>
          ) : (
            <div style={s.confirmRow}>
              <p style={s.confirmText}>Are you sure? This cannot be undone.</p>
              <button onClick={handleDelete} disabled={deleting} style={{ ...s.deleteBtn, opacity: deleting ? 0.6 : 1 }}>
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)} style={s.cancelBtn}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// ── Row helper ────────────────────────────────────────────────────────────────

function Row({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: '1rem', padding: '0.4rem 0', borderBottom: '1px solid rgba(10,10,22,0.05)' }}>
      <dt style={{ minWidth: '120px', fontSize: '0.78rem', color: 'rgba(10,10,22,0.4)', fontFamily: 'system-ui', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: '0.05rem' }}>
        {label}
      </dt>
      <dd style={{ margin: 0, fontSize: '0.88rem', color: '#4f5d75', fontFamily: mono ? 'monospace' : 'system-ui', lineHeight: 1.5 }}>
        {value}
      </dd>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  wrap:       { display: 'flex', flexDirection: 'column', gap: '1rem' },
  card:       { background: '#fff', borderRadius: '10px', boxShadow: '0 1px 8px rgba(10,10,22,0.07)', padding: '1.5rem', border: '1px solid rgba(10,10,22,0.06)' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  cardTitle:  { margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#4f5d75', fontFamily: 'system-ui' },
  editBtn:    { background: 'none', border: '1px solid rgba(10,10,22,0.18)', borderRadius: '6px', padding: '0.3rem 0.75rem', fontSize: '0.78rem', fontFamily: 'system-ui', color: 'rgba(10,10,22,0.6)', cursor: 'pointer' },
  dl:         { margin: 0 },
  grid:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem', marginBottom: '1.25rem' },
  field:      {},
  label:      { display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'rgba(10,10,22,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem', fontFamily: 'system-ui' },
  input:      { width: '100%', padding: '0.45rem 0.65rem', border: '1px solid rgba(10,10,22,0.18)', borderRadius: '6px', fontSize: '0.88rem', fontFamily: 'system-ui', color: '#4f5d75', background: '#fff', boxSizing: 'border-box' },
  textarea:   { width: '100%', padding: '0.45rem 0.65rem', border: '1px solid rgba(10,10,22,0.18)', borderRadius: '6px', fontSize: '0.88rem', fontFamily: 'system-ui', color: '#4f5d75', background: '#fff', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 },
  editBtns:   { display: 'flex', gap: '0.6rem' },
  saveBtn:    { background: '#4f5d75', color: '#f0ece4', border: 'none', borderRadius: '6px', padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'system-ui', cursor: 'pointer' },
  cancelBtn:  { background: 'none', border: '1px solid rgba(10,10,22,0.15)', borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.85rem', fontFamily: 'system-ui', color: 'rgba(10,10,22,0.55)', cursor: 'pointer' },
  statusRow:  { display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' },
  badge:      { fontSize: '0.75rem', fontWeight: 700, fontFamily: 'system-ui', letterSpacing: '0.05em', textTransform: 'uppercase', borderRadius: '999px', padding: '0.25em 0.7em' },
  transitionBtns: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
  advanceBtn: { background: '#4f5d75', color: '#f0ece4', border: 'none', borderRadius: '6px', padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'system-ui', cursor: 'pointer' },
  cancelStatusBtn: { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'system-ui', cursor: 'pointer' },
  memRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' },
  memName:    { margin: '0 0 0.2rem', fontSize: '0.92rem', fontWeight: 600, color: '#4f5d75', fontFamily: 'system-ui' },
  memMeta:    { margin: 0, fontSize: '0.76rem', color: 'rgba(10,10,22,0.45)', fontFamily: 'system-ui' },
  memActions: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 },
  memLink:    { color: '#cdba93', fontSize: '0.82rem', fontFamily: 'system-ui', fontWeight: 600, textDecoration: 'none' },
  unlinkBtn:  { background: 'none', border: '1px solid rgba(10,10,22,0.15)', borderRadius: '5px', padding: '0.25rem 0.65rem', fontSize: '0.76rem', fontFamily: 'system-ui', color: 'rgba(10,10,22,0.5)', cursor: 'pointer' },
  noMem:      { margin: '0 0 0.75rem', fontSize: '0.82rem', color: 'rgba(10,10,22,0.4)', fontFamily: 'system-ui', fontStyle: 'italic' },
  noMemHint:  { margin: 0, fontSize: '0.82rem', color: 'rgba(10,10,22,0.4)', fontFamily: 'system-ui', lineHeight: 1.6 },
  linkRow:    { display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' },
  select:     { padding: '0.45rem 0.65rem', border: '1px solid rgba(10,10,22,0.18)', borderRadius: '6px', fontSize: '0.875rem', fontFamily: 'system-ui', color: '#4f5d75', background: '#fff', minWidth: '200px' },
  linkBtn:    { background: '#4f5d75', color: '#f0ece4', border: 'none', borderRadius: '6px', padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'system-ui', cursor: 'pointer' },
  inlineLink: { color: '#cdba93', fontWeight: 600, textDecoration: 'none' },
  danger:     { background: '#fff', borderRadius: '10px', padding: '1.5rem', border: '1px solid #fecaca' },
  dangerTitle:{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 600, color: '#b91c1c', fontFamily: 'system-ui' },
  deleteBtn:  { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'system-ui', cursor: 'pointer' },
  confirmRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' },
  confirmText:{ margin: 0, fontSize: '0.82rem', color: '#b91c1c', fontFamily: 'system-ui' },
  err:        { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.6rem 0.9rem', color: '#b91c1c', fontSize: '0.82rem', fontFamily: 'system-ui', margin: '0 0 0.75rem' },
  ok:         { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '0.6rem 0.9rem', color: '#15803d', fontSize: '0.82rem', fontFamily: 'system-ui', margin: '0 0 0.75rem' },
};

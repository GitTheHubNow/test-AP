'use client';

// components/pet-cases/PetCaseDetail.tsx
//
// Full pet case detail view. Mirrors components/cases/CaseDetail.tsx's
// structure (details/edit card → status/progress card → memorial link
// card → danger zone), with one real divergence: where CaseDetail has a
// simple ACTIVE→COMPLETED/CANCELLED status card, this has a 5-stage
// progress card that's the actual point of the page — see the original
// workflow notes' "what do I need to do next" framing. Advancing a stage
// here writes a PetCaseStageEvent server-side (see the PATCH route),
// which is what the owner tracker page renders as a timeline.

import { useState, useTransition } from 'react';
import { useRouter }               from 'next/navigation';
import Link                        from 'next/link';
import {
  STATUS_LABELS, STATUS_COLORS,
  STAGE_LABELS, STAGE_COLORS, STAGE_ORDER,
  INTAKE_SOURCE_LABELS,
  memDisplayName, formatDate, formatDateTime,
  nextStage, prevStage,
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
  workflowStage: string | null;
  publishedAt:   string | null;
}

interface StageEvent {
  id:        string;
  stage:     PetCaseStage;
  note:      string | null;
  createdAt: string;
  createdBy: string | null;
}

interface PetCase {
  id:                 string;
  caseRef:            string;
  petName:            string;
  species:            string | null;
  breed:              string | null;
  ownerContactName:   string;
  ownerContactEmail:  string | null;
  ownerContactPhone:  string | null;
  intakeSource:       'VET' | 'OWNER' | 'WALK_IN';
  vetClinicName:      string | null;
  vetContactName:     string | null;
  vetContactEmail:    string | null;
  vetContactPhone:    string | null;
  stage:              PetCaseStage;
  serviceType:        string | null;
  notes:              string | null;
  status:             CaseStatus;
  trackerToken:       string | null;
  collectedAt:        string | null;
  receivedAt:         string | null;
  readyAt:            string | null;
  returnedAt:         string | null;
  memorialId:         string | null;
  createdAt:          string;
  updatedAt:          string;
  memorial:           LinkedMemorial | null;
  stageEvents:        StageEvent[];
}

interface UnlinkedMemorial {
  id:            string;
  title:         string | null;
  firstName:     string | null;
  lastName:      string | null;
  preferredName: string | null;
}

interface Props {
  initialCase:       PetCase;
  unlinkedMemorials: UnlinkedMemorial[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PetCaseDetail({ initialCase, unlinkedMemorials }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [c, setC] = useState<PetCase>(initialCase);

  // Edit state
  const [editing,           setEditing]           = useState(false);
  const [petName,           setPetName]           = useState(c.petName);
  const [species,           setSpecies]           = useState(c.species ?? '');
  const [breed,             setBreed]             = useState(c.breed ?? '');
  const [ownerContactName,  setOwnerContactName]  = useState(c.ownerContactName);
  const [ownerContactEmail, setOwnerContactEmail] = useState(c.ownerContactEmail ?? '');
  const [ownerContactPhone, setOwnerContactPhone] = useState(c.ownerContactPhone ?? '');
  const [serviceType,       setServiceType]       = useState(c.serviceType ?? '');
  const [notes,             setNotes]             = useState(c.notes ?? '');

  // UI state
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [success,       setSuccess]       = useState<string | null>(null);
  const [advancing,     setAdvancing]     = useState(false);
  const [linking,       setLinking]       = useState(false);
  const [selectedMem,   setSelectedMem]   = useState('');
  const [deleting,      setDeleting]      = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copiedLink,    setCopiedLink]    = useState(false);

  // ── API helper ──────────────────────────────────────────────────────────────

  async function patch(body: Record<string, unknown>) {
    const res  = await fetch(`/api/org/pet-cases/${c.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error ?? 'Update failed');
    return json.data.petCase as PetCase;
  }

  // ── Save edits ──────────────────────────────────────────────────────────────

  async function handleSave() {
    setError(null);
    if (!petName.trim())          { setError("Pet's name is required.");  return; }
    if (!ownerContactName.trim()) { setError('Owner name is required.');  return; }
    setSaving(true);
    try {
      const updated = await patch({
        petName:           petName.trim(),
        species:           species.trim()           || null,
        breed:             breed.trim()              || null,
        ownerContactName:  ownerContactName.trim(),
        ownerContactEmail: ownerContactEmail.trim()  || null,
        ownerContactPhone: ownerContactPhone.trim()  || null,
        serviceType:       serviceType.trim()        || null,
        notes:             notes.trim()               || null,
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
    setPetName(c.petName);
    setSpecies(c.species ?? '');
    setBreed(c.breed ?? '');
    setOwnerContactName(c.ownerContactName);
    setOwnerContactEmail(c.ownerContactEmail ?? '');
    setOwnerContactPhone(c.ownerContactPhone ?? '');
    setServiceType(c.serviceType ?? '');
    setNotes(c.notes ?? '');
    setEditing(false);
    setError(null);
  }

  // ── Stage transition ────────────────────────────────────────────────────────

  async function handleStageChange(stage: PetCaseStage) {
    setError(null);
    setAdvancing(true);
    try {
      const updated = await patch({ stage });
      setC(updated);
      setSuccess(`Moved to ${STAGE_LABELS[stage]}.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdvancing(false);
    }
  }

  async function handleCaseStatus(status: CaseStatus) {
    setError(null);
    setAdvancing(true);
    try {
      const updated = await patch({ status });
      setC(updated);
      setSuccess(`Marked as ${STATUS_LABELS[status]}.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdvancing(false);
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
      const res  = await fetch(`/api/org/pet-cases/${c.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Delete failed');
      router.push('/dashboard/pet-cases');
    } catch (e: any) {
      setError(e.message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  // ── Tracker link ────────────────────────────────────────────────────────────

  const trackerUrl = c.trackerToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/pet-tracker/${c.trackerToken}`
    : null;

  function handleCopyTrackerLink() {
    if (!trackerUrl) return;
    navigator.clipboard.writeText(trackerUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const statusColors = STATUS_COLORS[c.status];
  const stageColors  = STAGE_COLORS[c.stage];
  const next = nextStage(c.stage);
  const prev = prevStage(c.stage);

  return (
    <div style={s.wrap}>

      {/* ── Global feedback ── */}
      {error   && <p style={s.err}>{error}</p>}
      {success && <p style={s.ok}>{success}</p>}

      {/* ── Owner tracker link ── */}
      {trackerUrl && (
        <div style={s.trackerCard}>
          <div>
            <p style={s.trackerLabel}>Owner tracker link</p>
            <p style={s.trackerUrl}>{trackerUrl}</p>
          </div>
          <button onClick={handleCopyTrackerLink} style={s.copyBtn}>
            {copiedLink ? 'Copied ✓' : 'Copy link'}
          </button>
        </div>
      )}

      {/* ── Stage progress card — the main event on this page ── */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>Progress</h2>

        <div style={s.stageTrack}>
          {STAGE_ORDER.map((stage, i) => {
            const idx        = STAGE_ORDER.indexOf(c.stage);
            const isDone      = i < idx;
            const isCurrent   = stage === c.stage;
            const colors      = STAGE_COLORS[stage];
            return (
              <div key={stage} style={s.stageStep}>
                <div style={{
                  ...s.stageDot,
                  background: isDone || isCurrent ? colors.text : '#fff',
                  border:     `2px solid ${isDone || isCurrent ? colors.text : 'rgba(10,10,22,0.15)'}`,
                }} />
                <span style={{
                  ...s.stageStepLabel,
                  color:      isCurrent ? colors.text : 'rgba(10,10,22,0.4)',
                  fontWeight: isCurrent ? 700 : 500,
                }}>
                  {STAGE_LABELS[stage]}
                </span>
                {i < STAGE_ORDER.length - 1 && (
                  <div style={{
                    ...s.stageLine,
                    background: isDone ? colors.text : 'rgba(10,10,22,0.1)',
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {c.status === 'ACTIVE' && (
          <div style={s.stageBtns}>
            {prev && (
              <button
                onClick={() => handleStageChange(prev)}
                disabled={advancing}
                style={{ ...s.backBtn, opacity: advancing ? 0.6 : 1 }}
              >
                ← Back to {STAGE_LABELS[prev]}
              </button>
            )}
            {next && (
              <button
                onClick={() => handleStageChange(next)}
                disabled={advancing}
                style={{ ...s.advanceBtn, opacity: advancing ? 0.6 : 1 }}
              >
                Advance to {STAGE_LABELS[next]} →
              </button>
            )}
          </div>
        )}

        {c.stage === 'RETURNED' && c.status === 'ACTIVE' && (
          <div style={s.completeRow}>
            <button
              onClick={() => handleCaseStatus('COMPLETED')}
              disabled={advancing}
              style={{ ...s.advanceBtn, opacity: advancing ? 0.6 : 1 }}
            >
              Mark case as Completed
            </button>
          </div>
        )}

        {c.status === 'ACTIVE' && c.stage !== 'RETURNED' && (
          <div style={s.completeRow}>
            <button
              onClick={() => handleCaseStatus('CANCELLED')}
              disabled={advancing}
              style={s.cancelStatusBtn}
            >
              Cancel case
            </button>
          </div>
        )}

        {c.status !== 'ACTIVE' && (
          <div style={s.statusRow}>
            <span style={{
              ...s.badge,
              background: statusColors.bg,
              color:      statusColors.text,
              border:     `1px solid ${statusColors.border}`,
            }}>
              {STATUS_LABELS[c.status]}
            </span>
          </div>
        )}

        {/* Stage history */}
        {c.stageEvents.length > 0 && (
          <div style={s.historyBlock}>
            <p style={s.historyTitle}>History</p>
            {c.stageEvents.map(ev => (
              <div key={ev.id} style={s.historyRow}>
                <span style={s.historyStage}>{STAGE_LABELS[ev.stage]}</span>
                <span style={s.historyDate}>{formatDateTime(ev.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

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
                <label style={s.label}>Pet's name *</label>
                <input value={petName} onChange={e => setPetName(e.target.value)} style={s.input} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Species</label>
                <input value={species} onChange={e => setSpecies(e.target.value)} style={s.input} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Breed</label>
                <input value={breed} onChange={e => setBreed(e.target.value)} style={s.input} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Owner name *</label>
                <input value={ownerContactName} onChange={e => setOwnerContactName(e.target.value)} style={s.input} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Owner email</label>
                <input type="email" value={ownerContactEmail} onChange={e => setOwnerContactEmail(e.target.value)} style={s.input} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Owner phone</label>
                <input type="tel" value={ownerContactPhone} onChange={e => setOwnerContactPhone(e.target.value)} style={s.input} />
              </div>
              <div style={{ ...s.field, gridColumn: '1 / -1' }}>
                <label style={s.label}>Service type</label>
                <input value={serviceType} onChange={e => setServiceType(e.target.value)} style={s.input} />
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
            <Row label="Case ref"     value={c.caseRef} mono />
            <Row label="Pet"          value={c.petName} />
            <Row label="Species"      value={c.species} />
            <Row label="Breed"        value={c.breed} />
            <Row label="Owner"        value={c.ownerContactName} />
            <Row label="Owner email"  value={c.ownerContactEmail} />
            <Row label="Owner phone"  value={c.ownerContactPhone} />
            <Row label="Intake"       value={INTAKE_SOURCE_LABELS[c.intakeSource]} />
            <Row label="Vet clinic"   value={c.vetClinicName} />
            <Row label="Service type" value={c.serviceType} />
            <Row label="Notes"        value={c.notes} />
            <Row label="Created"      value={formatDate(c.createdAt)} />
          </dl>
        )}
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
                  <Link href={`/dashboard/memorial/${c.memorial.id}/qr`} style={s.memLink}>
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
            <p style={s.noMem}>No memorial linked to this pet case yet.</p>
            <div style={s.createMemRow}>
              <Link href={`/dashboard/pet-cases/${c.id}/create-memorial`} style={s.createMemBtn}>
                Create memorial from this case →
              </Link>
            </div>
            {unlinkedMemorials.length > 0 && (
              <div style={s.linkRow}>
                <select
                  value={selectedMem}
                  onChange={e => setSelectedMem(e.target.value)}
                  style={s.select}
                >
                  <option value="">Or link an existing memorial…</option>
                  {unlinkedMemorials.map(m => (
                    <option key={m.id} value={m.id}>{memDisplayName(m)}</option>
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
              Delete pet case
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

  trackerCard:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', background: '#fff', borderRadius: '10px', padding: '1rem 1.25rem', border: '1px solid rgba(10,10,22,0.06)', flexWrap: 'wrap' },
  trackerLabel: { margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: 700, color: 'rgba(10,10,22,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'system-ui' },
  trackerUrl:   { margin: 0, fontSize: '0.82rem', color: '#4f5d75', fontFamily: 'monospace', wordBreak: 'break-all' },
  copyBtn:      { background: '#4f5d75', color: '#f0ece4', border: 'none', borderRadius: '6px', padding: '0.4rem 0.9rem', fontSize: '0.78rem', fontWeight: 600, fontFamily: 'system-ui', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },

  stageTrack: { display: 'flex', alignItems: 'flex-start', marginBottom: '1.25rem' },
  stageStep:  { display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', flex: 1 },
  stageDot:   { width: '14px', height: '14px', borderRadius: '50%', marginBottom: '0.4rem', boxSizing: 'border-box' },
  stageStepLabel: { fontSize: '0.72rem', fontFamily: 'system-ui', textAlign: 'center' },
  stageLine:  { position: 'absolute', top: '6px', left: '50%', width: '100%', height: '2px', zIndex: -1 },

  stageBtns:    { display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.75rem' },
  backBtn:      { background: 'none', border: '1px solid rgba(10,10,22,0.18)', borderRadius: '6px', padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'system-ui', color: 'rgba(10,10,22,0.55)', cursor: 'pointer' },
  advanceBtn:   { background: '#4f5d75', color: '#f0ece4', border: 'none', borderRadius: '6px', padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'system-ui', cursor: 'pointer' },
  completeRow:  { marginBottom: '0.5rem' },
  cancelStatusBtn: { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'system-ui', cursor: 'pointer' },
  statusRow:  { display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' },
  badge:      { fontSize: '0.75rem', fontWeight: 700, fontFamily: 'system-ui', letterSpacing: '0.05em', textTransform: 'uppercase', borderRadius: '999px', padding: '0.25em 0.7em' },

  historyBlock: { marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(10,10,22,0.06)' },
  historyTitle: { margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 700, color: 'rgba(10,10,22,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'system-ui' },
  historyRow:   { display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', fontSize: '0.8rem', fontFamily: 'system-ui' },
  historyStage: { color: '#4f5d75', fontWeight: 600 },
  historyDate:  { color: 'rgba(10,10,22,0.4)' },

  memRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' },
  memName:    { margin: '0 0 0.2rem', fontSize: '0.92rem', fontWeight: 600, color: '#4f5d75', fontFamily: 'system-ui' },
  memMeta:    { margin: 0, fontSize: '0.76rem', color: 'rgba(10,10,22,0.45)', fontFamily: 'system-ui' },
  memActions: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 },
  memLink:    { color: '#cdba93', fontSize: '0.82rem', fontFamily: 'system-ui', fontWeight: 600, textDecoration: 'none' },
  unlinkBtn:  { background: 'none', border: '1px solid rgba(10,10,22,0.15)', borderRadius: '5px', padding: '0.25rem 0.65rem', fontSize: '0.76rem', fontFamily: 'system-ui', color: 'rgba(10,10,22,0.5)', cursor: 'pointer' },
  noMem:      { margin: '0 0 0.75rem', fontSize: '0.82rem', color: 'rgba(10,10,22,0.4)', fontFamily: 'system-ui', fontStyle: 'italic' },
  createMemRow: { marginBottom: '0.75rem' },
  createMemBtn: { display: 'inline-block', background: '#4f5d75', color: '#f0ece4', borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'system-ui', textDecoration: 'none' },
  linkRow:    { display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' },
  select:     { padding: '0.45rem 0.65rem', border: '1px solid rgba(10,10,22,0.18)', borderRadius: '6px', fontSize: '0.875rem', fontFamily: 'system-ui', color: '#4f5d75', background: '#fff', minWidth: '200px' },
  linkBtn:    { background: '#4f5d75', color: '#f0ece4', border: 'none', borderRadius: '6px', padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'system-ui', cursor: 'pointer' },

  danger:     { background: '#fff', borderRadius: '10px', padding: '1.5rem', border: '1px solid #fecaca' },
  dangerTitle:{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 600, color: '#b91c1c', fontFamily: 'system-ui' },
  deleteBtn:  { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'system-ui', cursor: 'pointer' },
  confirmRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' },
  confirmText:{ margin: 0, fontSize: '0.82rem', color: '#b91c1c', fontFamily: 'system-ui' },
  err:        { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.6rem 0.9rem', color: '#b91c1c', fontSize: '0.82rem', fontFamily: 'system-ui', margin: '0 0 0.75rem' },
  ok:         { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '0.6rem 0.9rem', color: '#15803d', fontSize: '0.82rem', fontFamily: 'system-ui', margin: '0 0 0.75rem' },
};

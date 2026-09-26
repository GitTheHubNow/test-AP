'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { INTAKE_SOURCE_LABELS } from '@/components/pet-cases/petCaseUtils';

// components/pet-cases/IntakeRequestList.tsx
//
// Staff review queue UI. Each pending request expands to an inline
// approval form — staff supply caseRef (required; the public form has
// no way to know the org's numbering scheme) and can override any field
// the submitter provided before it becomes a real PetCase, since public
// form input is unvalidated and often imprecise.

interface IntakeRequest {
  id:                 string;
  submittedBy:        'VET' | 'OWNER' | 'WALK_IN';
  petName:            string;
  species:            string | null;
  breed:              string | null;
  ownerContactName:   string;
  ownerContactEmail:  string | null;
  ownerContactPhone:  string | null;
  vetClinicName:      string | null;
  vetContactName:     string | null;
  vetContactEmail:    string | null;
  vetContactPhone:    string | null;
  serviceType:        string | null;
  notes:              string | null;
  status:             'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt:          string;
}

interface Props {
  initialRequests: IntakeRequest[];
}

export function IntakeRequestList({ initialRequests }: Props) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function removeFromList(id: string) {
    setRequests(prev => prev.filter(r => r.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  if (requests.length === 0) {
    return (
      <div style={s.empty}>
        <p style={s.emptyText}>No pending intake requests.</p>
      </div>
    );
  }

  return (
    <div style={s.list}>
      {requests.map(r => (
        <RequestCard
          key={r.id}
          request={r}
          expanded={expandedId === r.id}
          onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
          onResolved={() => { removeFromList(r.id); router.refresh(); }}
        />
      ))}
    </div>
  );
}

function RequestCard({
  request, expanded, onToggle, onResolved,
}: {
  request:    IntakeRequest;
  expanded:   boolean;
  onToggle:   () => void;
  onResolved: () => void;
}) {
  const [caseRef,           setCaseRef]           = useState('');
  const [petName,           setPetName]           = useState(request.petName);
  const [ownerContactName,  setOwnerContactName]  = useState(request.ownerContactName);
  const [serviceType,       setServiceType]       = useState(request.serviceType ?? '');
  const [error,             setError]             = useState<string | null>(null);
  const [approving,         setApproving]         = useState(false);
  const [rejecting,         setRejecting]         = useState(false);
  const [confirmReject,     setConfirmReject]     = useState(false);

  async function handleApprove() {
    setError(null);
    if (!caseRef.trim()) { setError('Case reference is required.'); return; }
    setApproving(true);
    try {
      const res = await fetch(`/api/org/pet-intake-requests/${request.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:           'APPROVE',
          caseRef:          caseRef.trim(),
          petName:          petName.trim(),
          ownerContactName: ownerContactName.trim(),
          serviceType:      serviceType.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to approve');
      onResolved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    setRejecting(true);
    try {
      const res = await fetch(`/api/org/pet-intake-requests/${request.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'REJECT' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to reject');
      onResolved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRejecting(false);
      setConfirmReject(false);
    }
  }

  return (
    <div style={s.card}>
      <button onClick={onToggle} style={s.cardHeader}>
        <div style={s.cardHeaderLeft}>
          <span style={s.name}>{request.petName}{request.species ? ` (${request.species})` : ''}</span>
          <span style={s.sourceTag}>{INTAKE_SOURCE_LABELS[request.submittedBy] ?? request.submittedBy}</span>
        </div>
        <span style={s.chevron}>{expanded ? '−' : '+'}</span>
      </button>

      <div style={s.meta}>
        Owner: {request.ownerContactName}
        {request.ownerContactEmail && ` · ${request.ownerContactEmail}`}
        {request.ownerContactPhone && ` · ${request.ownerContactPhone}`}
      </div>

      {expanded && (
        <div style={s.body}>
          {request.breed && <Row label="Breed" value={request.breed} />}
          {request.serviceType && <Row label="Requested service" value={request.serviceType} />}
          {request.vetClinicName && <Row label="Clinic" value={request.vetClinicName} />}
          {request.vetContactName && <Row label="Vet contact" value={request.vetContactName} />}
          {request.notes && <Row label="Notes" value={request.notes} />}

          {error && <p style={s.err}>{error}</p>}

          <div style={s.approveBlock}>
            <p style={s.approveTitle}>Approve → create pet case</p>
            <div style={s.grid}>
              <div>
                <label style={s.label}>Case reference *</label>
                <input value={caseRef} onChange={e => setCaseRef(e.target.value)} placeholder="PET-0087" style={s.input} />
              </div>
              <div>
                <label style={s.label}>Pet's name</label>
                <input value={petName} onChange={e => setPetName(e.target.value)} style={s.input} />
              </div>
              <div>
                <label style={s.label}>Owner name</label>
                <input value={ownerContactName} onChange={e => setOwnerContactName(e.target.value)} style={s.input} />
              </div>
              <div>
                <label style={s.label}>Service type</label>
                <input value={serviceType} onChange={e => setServiceType(e.target.value)} style={s.input} />
              </div>
            </div>
            <div style={s.actions}>
              <button onClick={handleApprove} disabled={approving} style={{ ...s.approveBtn, opacity: approving ? 0.6 : 1 }}>
                {approving ? 'Approving…' : 'Approve & create case'}
              </button>
              {!confirmReject ? (
                <button onClick={() => setConfirmReject(true)} style={s.rejectBtn}>Reject</button>
              ) : (
                <>
                  <button onClick={handleReject} disabled={rejecting} style={{ ...s.rejectConfirmBtn, opacity: rejecting ? 0.6 : 1 }}>
                    {rejecting ? '…' : 'Confirm reject'}
                  </button>
                  <button onClick={() => setConfirmReject(false)} style={s.cancelBtn}>Cancel</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '1rem', padding: '0.3rem 0', fontSize: '0.82rem', fontFamily: 'system-ui' }}>
      <span style={{ minWidth: '110px', color: 'rgba(10,10,22,0.4)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.04em', paddingTop: '0.1rem' }}>{label}</span>
      <span style={{ color: '#4f5d75' }}>{value}</span>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  list:  { display: 'flex', flexDirection: 'column', gap: '0.65rem' },
  empty: { background: '#fff', borderRadius: '10px', padding: '2.5rem', textAlign: 'center' },
  emptyText: { margin: 0, color: 'rgba(10,10,22,0.35)', fontSize: '0.875rem', fontFamily: 'system-ui' },

  card: { background: '#fff', borderRadius: '10px', border: '1px solid rgba(10,10,22,0.06)', boxShadow: '0 1px 6px rgba(10,10,22,0.06)', overflow: 'hidden' },
  cardHeader: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem 0.4rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' },
  cardHeaderLeft: { display: 'flex', alignItems: 'center', gap: '0.6rem' },
  name: { fontSize: '0.95rem', fontWeight: 600, color: '#4f5d75', fontFamily: 'system-ui' },
  sourceTag: { fontSize: '0.68rem', fontWeight: 700, color: 'rgba(10,10,22,0.4)', background: '#f7f5f2', padding: '0.15em 0.55em', borderRadius: '999px', fontFamily: 'system-ui', textTransform: 'uppercase', letterSpacing: '0.04em' },
  chevron: { fontSize: '1.1rem', color: 'rgba(10,10,22,0.3)', fontFamily: 'system-ui' },
  meta: { padding: '0 1.25rem 1rem', fontSize: '0.78rem', color: 'rgba(10,10,22,0.45)', fontFamily: 'system-ui' },

  body: { padding: '0 1.25rem 1.25rem', borderTop: '1px solid rgba(10,10,22,0.05)' },
  err: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.5rem 0.8rem', color: '#b91c1c', fontSize: '0.78rem', fontFamily: 'system-ui', margin: '0.75rem 0 0' },

  approveBlock: { marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed rgba(10,10,22,0.1)' },
  approveTitle: { margin: '0 0 0.75rem', fontSize: '0.78rem', fontWeight: 700, color: 'rgba(10,10,22,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'system-ui' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' },
  label: { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'rgba(10,10,22,0.45)', marginBottom: '0.25rem', fontFamily: 'system-ui' },
  input: { width: '100%', boxSizing: 'border-box', padding: '0.4rem 0.6rem', border: '1px solid rgba(10,10,22,0.18)', borderRadius: '6px', fontSize: '0.85rem', fontFamily: 'system-ui', color: '#4f5d75' },
  actions: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
  approveBtn: { background: '#4f5d75', color: '#f0ece4', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'system-ui', cursor: 'pointer' },
  rejectBtn: { background: 'none', border: '1px solid rgba(10,10,22,0.15)', borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.82rem', fontFamily: 'system-ui', color: 'rgba(10,10,22,0.5)', cursor: 'pointer' },
  rejectConfirmBtn: { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'system-ui', cursor: 'pointer' },
  cancelBtn: { background: 'none', border: 'none', color: 'rgba(10,10,22,0.4)', fontSize: '0.82rem', fontFamily: 'system-ui', cursor: 'pointer' },
};

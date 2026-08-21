'use client';

// components/cases/NewCaseForm.tsx
//
// Form for creating a new FuneralCase.
// POSTs to /api/org/cases, then redirects to the new case detail page.

import { useState }    from 'react';
import { useRouter }   from 'next/navigation';

export function NewCaseForm() {
  const router = useRouter();

  const [caseRef,       setCaseRef]       = useState('');
  const [deceasedName,  setDeceasedName]  = useState('');
  const [familyContact, setFamilyContact] = useState('');
  const [contactEmail,  setContactEmail]  = useState('');
  const [contactPhone,  setContactPhone]  = useState('');
  const [serviceDate,   setServiceDate]   = useState('');
  const [venue,         setVenue]         = useState('');
  const [notes,         setNotes]         = useState('');
  const [error,         setError]         = useState<string | null>(null);
  const [saving,        setSaving]        = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!caseRef.trim()) { setError('Case reference is required.'); return; }
    if (!deceasedName.trim()) { setError('Deceased name is required.'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/org/cases', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseRef:       caseRef.trim(),
          deceasedName:  deceasedName.trim(),
          familyContact: familyContact.trim() || undefined,
          contactEmail:  contactEmail.trim()  || undefined,
          contactPhone:  contactPhone.trim()  || undefined,
          serviceDate:   serviceDate          || undefined,
          venue:         venue.trim()         || undefined,
          notes:         notes.trim()         || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Failed to create case');
        return;
      }
      router.push(`/dashboard/cases/${json.data.case.id}`);
    } catch (e: any) {
      setError(e.message ?? 'Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={s.grid}>

        {/* Case reference */}
        <div style={{ ...s.field, gridColumn: '1 / -1' }}>
          <label style={s.label}>
            Case reference <span style={s.required}>*</span>
          </label>
          <p style={s.hint}>Your internal reference number e.g. 2026-0042</p>
          <input
            type="text"
            value={caseRef}
            onChange={e => setCaseRef(e.target.value)}
            placeholder="2026-0042"
            style={s.input}
            maxLength={80}
          />
        </div>

        {/* Deceased name */}
        <div style={{ ...s.field, gridColumn: '1 / -1' }}>
          <label style={s.label}>
            Deceased name <span style={s.required}>*</span>
          </label>
          <input
            type="text"
            value={deceasedName}
            onChange={e => setDeceasedName(e.target.value)}
            placeholder="Full name"
            style={s.input}
            maxLength={200}
          />
        </div>

        {/* Family contact */}
        <div style={s.field}>
          <label style={s.label}>Family contact <span style={s.opt}>optional</span></label>
          <input
            type="text"
            value={familyContact}
            onChange={e => setFamilyContact(e.target.value)}
            placeholder="Contact name"
            style={s.input}
          />
        </div>

        {/* Contact email */}
        <div style={s.field}>
          <label style={s.label}>Contact email <span style={s.opt}>optional</span></label>
          <input
            type="email"
            value={contactEmail}
            onChange={e => setContactEmail(e.target.value)}
            placeholder="email@example.com"
            style={s.input}
          />
        </div>

        {/* Contact phone */}
        <div style={s.field}>
          <label style={s.label}>Contact phone <span style={s.opt}>optional</span></label>
          <input
            type="tel"
            value={contactPhone}
            onChange={e => setContactPhone(e.target.value)}
            placeholder="+61 4xx xxx xxx"
            style={s.input}
          />
        </div>

        {/* Service date */}
        <div style={s.field}>
          <label style={s.label}>Service date <span style={s.opt}>optional</span></label>
          <input
            type="datetime-local"
            value={serviceDate}
            onChange={e => setServiceDate(e.target.value)}
            style={s.input}
          />
        </div>

        {/* Venue */}
        <div style={{ ...s.field, gridColumn: '1 / -1' }}>
          <label style={s.label}>Venue <span style={s.opt}>optional</span></label>
          <input
            type="text"
            value={venue}
            onChange={e => setVenue(e.target.value)}
            placeholder="Chapel name or address"
            style={s.input}
          />
        </div>

        {/* Notes */}
        <div style={{ ...s.field, gridColumn: '1 / -1' }}>
          <label style={s.label}>Notes <span style={s.opt}>optional</span></label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Internal notes for this case…"
            style={s.textarea}
          />
        </div>

      </div>

      {error && <p style={s.err}>{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={saving}
        style={{ ...s.btn, opacity: saving ? 0.6 : 1 }}
        type="button"
      >
        {saving ? 'Creating…' : 'Create case'}
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  grid: {
    display:             'grid',
    gridTemplateColumns: '1fr 1fr',
    gap:                 '1.1rem',
    marginBottom:        '1.5rem',
  },
  field: {},
  label: {
    display:       'block',
    fontSize:      '0.78rem',
    fontWeight:    600,
    color:         'rgba(10,10,22,0.55)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom:  '0.3rem',
    fontFamily:    'system-ui, sans-serif',
  },
  required: {
    color:         '#b91c1c',
    fontWeight:    700,
    textTransform: 'none',
    letterSpacing: 0,
  },
  opt: {
    fontWeight:    400,
    textTransform: 'none',
    letterSpacing: 0,
    color:         'rgba(10,10,22,0.3)',
  },
  hint: {
    margin:     '0 0 0.35rem',
    fontSize:   '0.74rem',
    color:      'rgba(10,10,22,0.38)',
    fontFamily: 'system-ui, sans-serif',
    lineHeight: 1.4,
  },
  input: {
    width:        '100%',
    padding:      '0.5rem 0.7rem',
    border:       '1px solid rgba(10,10,22,0.18)',
    borderRadius: '6px',
    fontSize:     '0.9rem',
    fontFamily:   'system-ui, sans-serif',
    color:        '#4f5d75',
    background:   '#fff',
    boxSizing:    'border-box',
  },
  textarea: {
    width:        '100%',
    padding:      '0.5rem 0.7rem',
    border:       '1px solid rgba(10,10,22,0.18)',
    borderRadius: '6px',
    fontSize:     '0.9rem',
    fontFamily:   'system-ui, sans-serif',
    color:        '#4f5d75',
    background:   '#fff',
    boxSizing:    'border-box',
    resize:       'vertical',
    lineHeight:   1.5,
  },
  err: {
    color:      '#b91c1c',
    fontSize:   '0.82rem',
    fontFamily: 'system-ui, sans-serif',
    margin:     '0 0 0.75rem',
  },
  btn: {
    background:    '#4f5d75',
    color:         '#f0ece4',
    border:        'none',
    borderRadius:  '7px',
    padding:       '0.65rem 1.4rem',
    fontSize:      '0.9rem',
    fontWeight:    600,
    fontFamily:    'system-ui, sans-serif',
    cursor:        'pointer',
    letterSpacing: '0.02em',
  },
};

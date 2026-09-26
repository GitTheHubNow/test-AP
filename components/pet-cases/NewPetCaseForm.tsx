'use client';

// components/pet-cases/NewPetCaseForm.tsx
//
// Form for creating a new PetCase. Mirrors components/cases/NewCaseForm.tsx
// structure exactly (same field/style conventions), with pet-specific
// fields swapped in: petName/species/breed instead of deceasedName,
// ownerContact* instead of familyContact/contactEmail/contactPhone, plus
// intakeSource + optional vet fields which have no human-case equivalent.
//
// POSTs to /api/org/pet-cases, then redirects to the new pet case detail page.

import { useState }    from 'react';
import { useRouter }   from 'next/navigation';

const INTAKE_SOURCES = [
  { value: 'OWNER',   label: 'Owner' },
  { value: 'VET',     label: 'Vet referral' },
  { value: 'WALK_IN', label: 'Walk-in' },
] as const;

export function NewPetCaseForm() {
  const router = useRouter();

  const [caseRef,           setCaseRef]           = useState('');
  const [petName,           setPetName]           = useState('');
  const [species,           setSpecies]           = useState('');
  const [breed,             setBreed]             = useState('');
  const [ownerContactName,  setOwnerContactName]  = useState('');
  const [ownerContactEmail, setOwnerContactEmail] = useState('');
  const [ownerContactPhone, setOwnerContactPhone] = useState('');
  const [intakeSource,      setIntakeSource]      = useState<'OWNER' | 'VET' | 'WALK_IN'>('OWNER');
  const [vetClinicName,     setVetClinicName]     = useState('');
  const [serviceType,       setServiceType]       = useState('');
  const [notes,             setNotes]             = useState('');
  const [error,             setError]             = useState<string | null>(null);
  const [saving,            setSaving]            = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!caseRef.trim())          { setError('Case reference is required.');  return; }
    if (!petName.trim())          { setError('Pet\'s name is required.');     return; }
    if (!ownerContactName.trim()) { setError('Owner contact name is required.'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/org/pet-cases', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseRef:           caseRef.trim(),
          petName:           petName.trim(),
          species:           species.trim()           || undefined,
          breed:             breed.trim()              || undefined,
          ownerContactName:  ownerContactName.trim(),
          ownerContactEmail: ownerContactEmail.trim()  || undefined,
          ownerContactPhone: ownerContactPhone.trim()  || undefined,
          intakeSource,
          vetClinicName:     intakeSource === 'VET' ? (vetClinicName.trim() || undefined) : undefined,
          serviceType:       serviceType.trim()        || undefined,
          notes:             notes.trim()               || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Failed to create pet case');
        return;
      }
      router.push(`/dashboard/pet-cases/${json.data.petCase.id}`);
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
          <p style={s.hint}>Your internal reference number e.g. PET-0087</p>
          <input
            type="text"
            value={caseRef}
            onChange={e => setCaseRef(e.target.value)}
            placeholder="PET-0087"
            style={s.input}
            maxLength={80}
          />
        </div>

        {/* Pet's name */}
        <div style={s.field}>
          <label style={s.label}>
            Pet's name <span style={s.required}>*</span>
          </label>
          <input
            type="text"
            value={petName}
            onChange={e => setPetName(e.target.value)}
            placeholder="Bella"
            style={s.input}
            maxLength={100}
          />
        </div>

        {/* Species */}
        <div style={s.field}>
          <label style={s.label}>Species <span style={s.opt}>optional</span></label>
          <input
            type="text"
            value={species}
            onChange={e => setSpecies(e.target.value)}
            placeholder="Dog, Cat, …"
            style={s.input}
          />
        </div>

        {/* Breed */}
        <div style={{ ...s.field, gridColumn: '1 / -1' }}>
          <label style={s.label}>Breed <span style={s.opt}>optional</span></label>
          <input
            type="text"
            value={breed}
            onChange={e => setBreed(e.target.value)}
            placeholder="Labrador Retriever"
            style={s.input}
          />
        </div>

        {/* Owner contact name */}
        <div style={{ ...s.field, gridColumn: '1 / -1' }}>
          <label style={s.label}>
            Owner name <span style={s.required}>*</span>
          </label>
          <input
            type="text"
            value={ownerContactName}
            onChange={e => setOwnerContactName(e.target.value)}
            placeholder="Full name"
            style={s.input}
            maxLength={200}
          />
        </div>

        {/* Owner email */}
        <div style={s.field}>
          <label style={s.label}>Owner email <span style={s.opt}>optional</span></label>
          <input
            type="email"
            value={ownerContactEmail}
            onChange={e => setOwnerContactEmail(e.target.value)}
            placeholder="owner@example.com"
            style={s.input}
          />
        </div>

        {/* Owner phone */}
        <div style={s.field}>
          <label style={s.label}>Owner phone <span style={s.opt}>optional</span></label>
          <input
            type="tel"
            value={ownerContactPhone}
            onChange={e => setOwnerContactPhone(e.target.value)}
            placeholder="+61 4xx xxx xxx"
            style={s.input}
          />
        </div>

        {/* Intake source */}
        <div style={s.field}>
          <label style={s.label}>How did this case come in?</label>
          <select
            value={intakeSource}
            onChange={e => setIntakeSource(e.target.value as typeof intakeSource)}
            style={s.input}
          >
            {INTAKE_SOURCES.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Vet clinic name — only relevant when intakeSource is VET */}
        {intakeSource === 'VET' && (
          <div style={s.field}>
            <label style={s.label}>Referring clinic <span style={s.opt}>optional</span></label>
            <input
              type="text"
              value={vetClinicName}
              onChange={e => setVetClinicName(e.target.value)}
              placeholder="Clinic name"
              style={s.input}
            />
          </div>
        )}

        {/* Service type */}
        <div style={{ ...s.field, gridColumn: '1 / -1' }}>
          <label style={s.label}>Service type <span style={s.opt}>optional</span></label>
          <input
            type="text"
            value={serviceType}
            onChange={e => setServiceType(e.target.value)}
            placeholder="Private cremation, Communal cremation, Aquamation…"
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
        {saving ? 'Creating…' : 'Create pet case'}
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

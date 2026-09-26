'use client';

// components/pet-cases/PetIntakeForm.tsx
//
// The interactive form on the public /pet-intake/[orgToken] page.
// POSTs to /api/pet-intake/[orgToken] — see that route for validation
// rules and the honeypot field's purpose (`website`, kept out of view
// via CSS below; a real visitor never sees or fills it, a bot scraping
// the form's fields typically will).

import { useState } from 'react';

interface Props {
  orgToken:    string;
  accentColor: string;
}

const SOURCES = [
  { value: 'OWNER', label: "I'm the owner" },
  { value: 'VET',   label: "I'm a vet / clinic staff" },
] as const;

export function PetIntakeForm({ orgToken, accentColor }: Props) {
  const [submittedBy,       setSubmittedBy]       = useState<'OWNER' | 'VET'>('OWNER');
  const [petName,           setPetName]           = useState('');
  const [species,           setSpecies]           = useState('');
  const [breed,             setBreed]             = useState('');
  const [ownerContactName,  setOwnerContactName]  = useState('');
  const [ownerContactEmail, setOwnerContactEmail] = useState('');
  const [ownerContactPhone, setOwnerContactPhone] = useState('');
  const [vetClinicName,     setVetClinicName]     = useState('');
  const [vetContactName,    setVetContactName]    = useState('');
  const [serviceType,       setServiceType]       = useState('');
  const [notes,             setNotes]             = useState('');
  const [website,           setWebsite]           = useState(''); // honeypot — never shown to real users

  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [submitted,  setSubmitted]  = useState(false);

  const canSubmit =
    petName.trim().length > 0 &&
    ownerContactName.trim().length > 0 &&
    (ownerContactEmail.trim().length > 0 || ownerContactPhone.trim().length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !canSubmit) return;
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/pet-intake/${orgToken}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submittedBy,
          petName:           petName.trim(),
          species:           species.trim()           || undefined,
          breed:             breed.trim()              || undefined,
          ownerContactName:  ownerContactName.trim(),
          ownerContactEmail: ownerContactEmail.trim()  || undefined,
          ownerContactPhone: ownerContactPhone.trim()  || undefined,
          vetClinicName:     submittedBy === 'VET' ? (vetClinicName.trim() || undefined) : undefined,
          vetContactName:    submittedBy === 'VET' ? (vetContactName.trim() || undefined) : undefined,
          serviceType:       serviceType.trim()        || undefined,
          notes:             notes.trim()               || undefined,
          website, // honeypot passthrough — empty for real users
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Something went wrong. Please try again.');
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ede8e0', padding: '2.5rem 2rem', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '1.5rem', fontWeight: 400, color: '#1a1714', marginBottom: '0.5rem' }}>
          Thank you
        </h2>
        <p style={{ fontFamily: 'Georgia, serif', fontSize: '0.9rem', color: '#98a2b3', lineHeight: 1.7 }}>
          We've received {petName}'s details and will be in touch shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 16, border: '1px solid #ede8e0', padding: '2rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.25rem', color: '#b91c1c', fontFamily: 'Georgia, serif', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* Honeypot — visually and structurally hidden from real visitors */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off"
          value={website} onChange={e => setWebsite(e.target.value)} />
      </div>

      {/* Who's submitting */}
      <div style={f.group}>
        <label style={f.label}>Who's filling this out?</label>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          {SOURCES.map(({ value, label }) => {
            const selected = submittedBy === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setSubmittedBy(value)}
                style={{
                  ...f.chip,
                  background: selected ? `${accentColor}22` : '#faf8f5',
                  borderColor: selected ? accentColor : '#ede8e0',
                  color: selected ? '#1a1714' : '#98a2b3',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={f.group}>
        <label style={f.label}>Pet's name *</label>
        <input style={f.input} value={petName} onChange={e => setPetName(e.target.value)} placeholder="Bella" />
      </div>

      <div style={f.row2}>
        <div style={f.group}>
          <label style={f.label}>Species</label>
          <input style={f.input} value={species} onChange={e => setSpecies(e.target.value)} placeholder="Dog, Cat…" />
        </div>
        <div style={f.group}>
          <label style={f.label}>Breed</label>
          <input style={f.input} value={breed} onChange={e => setBreed(e.target.value)} placeholder="Labrador" />
        </div>
      </div>

      <div style={f.group}>
        <label style={f.label}>Owner's name *</label>
        <input style={f.input} value={ownerContactName} onChange={e => setOwnerContactName(e.target.value)} placeholder="Full name" />
      </div>

      <div style={f.row2}>
        <div style={f.group}>
          <label style={f.label}>Owner's email</label>
          <input style={f.input} type="email" value={ownerContactEmail} onChange={e => setOwnerContactEmail(e.target.value)} placeholder="owner@example.com" />
        </div>
        <div style={f.group}>
          <label style={f.label}>Owner's phone</label>
          <input style={f.input} type="tel" value={ownerContactPhone} onChange={e => setOwnerContactPhone(e.target.value)} placeholder="+61 4xx xxx xxx" />
        </div>
      </div>
      {!ownerContactEmail.trim() && !ownerContactPhone.trim() && (
        <p style={f.hint}>Please provide at least one way to reach the owner.</p>
      )}

      {submittedBy === 'VET' && (
        <>
          <div style={f.group}>
            <label style={f.label}>Clinic name</label>
            <input style={f.input} value={vetClinicName} onChange={e => setVetClinicName(e.target.value)} placeholder="Clinic name" />
          </div>
          <div style={f.group}>
            <label style={f.label}>Your name</label>
            <input style={f.input} value={vetContactName} onChange={e => setVetContactName(e.target.value)} placeholder="Your name" />
          </div>
        </>
      )}

      <div style={f.group}>
        <label style={f.label}>Service type</label>
        <input style={f.input} value={serviceType} onChange={e => setServiceType(e.target.value)} placeholder="Private cremation, communal cremation…" />
      </div>

      <div style={f.group}>
        <label style={f.label}>Anything else we should know?</label>
        <textarea style={f.textarea} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
      </div>

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        style={{
          width: '100%', marginTop: '0.5rem', padding: '0.85rem',
          borderRadius: 10, border: 'none', fontFamily: 'Georgia, serif',
          fontSize: '0.9rem', color: '#fff',
          background: (!canSubmit || submitting) ? '#c9c2b8' : '#1a1714',
          cursor: (!canSubmit || submitting) ? 'default' : 'pointer',
        }}
      >
        {submitting ? 'Submitting…' : 'Submit'}
      </button>
    </form>
  );
}

const f: Record<string, React.CSSProperties> = {
  group:    { marginBottom: '1.1rem' },
  row2:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
  label:    { display: 'block', fontFamily: 'Georgia, serif', fontSize: '0.78rem', color: '#98a2b3', marginBottom: '0.35rem' },
  input:    { width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid #ede8e0', fontFamily: 'Georgia, serif', fontSize: '0.88rem', color: '#1a1714', background: '#faf8f5' },
  textarea: { width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid #ede8e0', fontFamily: 'Georgia, serif', fontSize: '0.88rem', color: '#1a1714', background: '#faf8f5', resize: 'vertical', lineHeight: 1.5 },
  chip:     { flex: 1, padding: '0.55rem 0.5rem', borderRadius: 8, border: '1.5px solid', fontFamily: 'Georgia, serif', fontSize: '0.82rem', cursor: 'pointer' },
  hint:     { margin: '-0.6rem 0 1.1rem', fontFamily: 'Georgia, serif', fontSize: '0.74rem', color: '#c9857a' },
};

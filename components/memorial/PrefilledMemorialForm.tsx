'use client';

// components/memorial/PrefilledMemorialForm.tsx
//
// Pre-fillable version of the memorial creation wizard.
// Accepts an optional `prefill` prop that seeds the initial form state
// from a linked FuneralCase — no re-typing required.
//
// IMPORTANT: This is an ADDITIVE component. It does not modify
// components/CreateMemorialForm.tsx (V1). The original /dashboard/memorials/new
// page continues to use CreateMemorialForm unchanged.
//
// Used by: app/dashboard/cases/[caseId]/create-memorial/page.tsx
//
// Pre-fill mapping (FuneralCase → memorial form):
//   deceasedName    → firstName + lastName (split on first space)
//   serviceDate     → funeralDate (date part) + serviceTime (time part)
//   venue           → venueName
//   familyContact   → familyContactName
//   contactEmail    → familyContactEmail
//   contactPhone    → familyContactPhone
//
// Fields the case does NOT have (blank, user fills in):
//   preferredName, dateOfBirth, dateOfDeath, placeOfPassing,
//   venueAddress, serviceType, culturalFlags

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ── Types (identical to CreateMemorialForm) ───────────────────────────────────

type CulturalFlags = {
  isAboriginal:           boolean;
  isTorresStraitIslander: boolean;
  isSouthSeaIslander:     boolean;
  isMaori:                boolean;
};

type ServiceType = 'BURIAL' | 'CREMATION' | 'CELEBRATION' | 'OTHER' | '';

interface FormData {
  firstName:          string;
  lastName:           string;
  preferredName:      string;
  dateOfBirth:        string;
  dateOfDeath:        string;
  placeOfPassing:     string;
  funeralDate:        string;
  serviceTime:        string;
  serviceType:        ServiceType;
  venueName:          string;
  venueAddress:       string;
  familyContactName:  string;
  familyContactEmail: string;
  familyContactPhone: string;
  culturalFlags:      CulturalFlags;
}

export interface CasePrefill {
  caseId:        string;
  deceasedName:  string;           // "John Smith" — split into firstName/lastName
  serviceDate:   string | null;    // ISO datetime string
  venue:         string | null;
  familyContact: string | null;
  contactEmail:  string | null;
  contactPhone:  string | null;
}

interface CreatedMemorial {
  id:              string;
  title:           string;
  uploadLinkToken: string;
  uploadUrl:       string;
  memorialUrl:     string;
}

// ── Pre-fill helper ───────────────────────────────────────────────────────────

function buildInitialData(prefill: CasePrefill | null): FormData {
  if (!prefill) {
    return {
      firstName: '', lastName: '', preferredName: '', dateOfBirth: '', dateOfDeath: '',
      placeOfPassing: '', funeralDate: '', serviceTime: '', serviceType: '',
      venueName: '', venueAddress: '', familyContactName: '', familyContactEmail: '',
      familyContactPhone: '',
      culturalFlags: { isAboriginal: false, isTorresStraitIslander: false, isSouthSeaIslander: false, isMaori: false },
    };
  }

  // Split "John Smith" → firstName="John", lastName="Smith"
  // "Mary Jane Watson" → firstName="Mary", lastName="Jane Watson"
  const parts     = prefill.deceasedName.trim().split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName  = parts.slice(1).join(' ') ?? '';

  // Split ISO datetime "2026-06-17T10:00:00.000Z" → date="2026-06-17", time="10:00"
  let funeralDate = '';
  let serviceTime = '';
  if (prefill.serviceDate) {
    const d = new Date(prefill.serviceDate);
    if (!isNaN(d.getTime())) {
      // Use local date parts to avoid timezone shifting the date
      funeralDate = d.toLocaleDateString('en-CA'); // YYYY-MM-DD
      serviceTime = d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
  }

  return {
    firstName,
    lastName,
    preferredName:      '',
    dateOfBirth:        '',
    dateOfDeath:        '',
    placeOfPassing:     '',
    funeralDate,
    serviceTime,
    serviceType:        '',
    venueName:          prefill.venue          ?? '',
    venueAddress:       '',
    familyContactName:  prefill.familyContact  ?? '',
    familyContactEmail: prefill.contactEmail   ?? '',
    familyContactPhone: prefill.contactPhone   ?? '',
    culturalFlags: {
      isAboriginal: false, isTorresStraitIslander: false,
      isSouthSeaIslander: false, isMaori: false,
    },
  };
}

// ── Shared input styles (match existing codebase exactly) ─────────────────────

const inp = 'w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100';
const lbl = 'block text-sm font-medium text-gray-700 mb-1';

const CULTURAL_GROUPS = [
  { key: 'isAboriginal'           as const, label: 'Aboriginal Australian',  description: 'This person identified as Aboriginal Australian' },
  { key: 'isTorresStraitIslander' as const, label: 'Torres Strait Islander', description: 'This person identified as Torres Strait Islander' },
  { key: 'isSouthSeaIslander'     as const, label: 'South Sea Islander',      description: 'This person identified as South Sea Islander' },
  { key: 'isMaori'                as const, label: 'Māori',                   description: 'This person identified as Māori' },
];

const SERVICE_TYPES: { value: ServiceType; label: string }[] = [
  { value: '', label: 'Select service type…' },
  { value: 'BURIAL', label: 'Burial' },
  { value: 'CREMATION', label: 'Cremation' },
  { value: 'CELEBRATION', label: 'Celebration of Life' },
  { value: 'OTHER', label: 'Other' },
];

const STEPS = [
  { number: 1, label: 'Deceased' },
  { number: 2, label: 'Service' },
  { number: 3, label: 'Family' },
  { number: 4, label: 'Cultural' },
  { number: 5, label: 'Confirm' },
];

// ── Step components (identical rendering to CreateMemorialForm) ───────────────

function StepDeceased({ data, onChange, disabled, prefilled }: {
  data: FormData; onChange: (k: keyof FormData, v: string) => void;
  disabled: boolean; prefilled: boolean;
}) {
  return (
    <div className="space-y-4">
      {prefilled && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm text-amber-800">
            ✓ Pre-filled from case. Review and adjust as needed.
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={lbl}>First Name <span className="text-red-500">*</span></label>
          <input className={inp} type="text" value={data.firstName} maxLength={100}
            onChange={e => onChange('firstName', e.target.value)} disabled={disabled} />
        </div>
        <div>
          <label className={lbl}>Last Name <span className="text-red-500">*</span></label>
          <input className={inp} type="text" value={data.lastName} maxLength={100}
            onChange={e => onChange('lastName', e.target.value)} disabled={disabled} />
        </div>
      </div>
      <div>
        <label className={lbl}>Preferred Name / Nickname <span className="text-gray-400 font-normal">(optional)</span></label>
        <input className={inp} type="text" value={data.preferredName} maxLength={100}
          onChange={e => onChange('preferredName', e.target.value)} disabled={disabled}
          placeholder="e.g. Dad, Nan, Bluey" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={lbl}>Date of Birth <span className="text-gray-400 font-normal">(optional)</span></label>
          <input className={inp} type="date" value={data.dateOfBirth}
            onChange={e => onChange('dateOfBirth', e.target.value)} disabled={disabled} />
        </div>
        <div>
          <label className={lbl}>Date of Passing <span className="text-gray-400 font-normal">(optional)</span></label>
          <input className={inp} type="date" value={data.dateOfDeath}
            onChange={e => onChange('dateOfDeath', e.target.value)} disabled={disabled} />
        </div>
      </div>
      <div>
        <label className={lbl}>Place of Passing <span className="text-gray-400 font-normal">(optional)</span></label>
        <input className={inp} type="text" value={data.placeOfPassing} maxLength={200}
          onChange={e => onChange('placeOfPassing', e.target.value)} disabled={disabled}
          placeholder="e.g. Brisbane, QLD" />
      </div>
    </div>
  );
}

function StepService({ data, onChange, disabled }: {
  data: FormData; onChange: (k: keyof FormData, v: string) => void; disabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={lbl}>Funeral Date <span className="text-gray-400 font-normal">(optional)</span></label>
          <input className={inp} type="date" value={data.funeralDate}
            onChange={e => onChange('funeralDate', e.target.value)} disabled={disabled} />
          <p className="mt-1 text-xs text-gray-500">Used to auto-schedule the family handover.</p>
        </div>
        <div>
          <label className={lbl}>Service Time <span className="text-gray-400 font-normal">(optional)</span></label>
          <input className={inp} type="time" value={data.serviceTime}
            onChange={e => onChange('serviceTime', e.target.value)} disabled={disabled} />
        </div>
      </div>
      <div>
        <label className={lbl}>Service Type <span className="text-gray-400 font-normal">(optional)</span></label>
        <select className={inp} value={data.serviceType}
          onChange={e => onChange('serviceType', e.target.value)} disabled={disabled}>
          {SERVICE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label className={lbl}>Venue Name <span className="text-gray-400 font-normal">(optional)</span></label>
        <input className={inp} type="text" value={data.venueName} maxLength={200}
          onChange={e => onChange('venueName', e.target.value)} disabled={disabled}
          placeholder="e.g. St Mary's Church" />
      </div>
      <div>
        <label className={lbl}>Venue Address <span className="text-gray-400 font-normal">(optional)</span></label>
        <input className={inp} type="text" value={data.venueAddress} maxLength={300}
          onChange={e => onChange('venueAddress', e.target.value)} disabled={disabled}
          placeholder="e.g. 123 Church St, Brisbane QLD 4000" />
      </div>
    </div>
  );
}

function StepFamily({ data, onChange, disabled }: {
  data: FormData; onChange: (k: keyof FormData, v: string) => void; disabled: boolean;
}) {
  const emailValid = data.familyContactEmail === '' ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.familyContactEmail.trim());
  return (
    <div className="space-y-4">
      <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3">
        <p className="text-sm text-blue-800">
          <strong>Why we ask:</strong> After the funeral, ownership is automatically transferred
          to the family contact. You can skip this and configure it later.
        </p>
      </div>
      <div>
        <label className={lbl}>Family Contact Name <span className="text-gray-400 font-normal">(optional)</span></label>
        <input className={inp} type="text" value={data.familyContactName} maxLength={150}
          onChange={e => onChange('familyContactName', e.target.value)} disabled={disabled} />
      </div>
      <div>
        <label className={lbl}>Family Contact Email <span className="text-gray-400 font-normal">(optional)</span></label>
        <input className={`${inp} ${!emailValid ? 'border-red-400' : ''}`} type="email"
          value={data.familyContactEmail} maxLength={250}
          onChange={e => onChange('familyContactEmail', e.target.value)} disabled={disabled} />
        {!emailValid && <p className="mt-1 text-xs text-red-500">Please enter a valid email address.</p>}
      </div>
      <div>
        <label className={lbl}>Family Contact Phone <span className="text-gray-400 font-normal">(optional)</span></label>
        <input className={inp} type="tel" value={data.familyContactPhone} maxLength={50}
          onChange={e => onChange('familyContactPhone', e.target.value)} disabled={disabled} />
      </div>
    </div>
  );
}

function StepCultural({ data, onToggle, disabled }: {
  data: FormData; onToggle: (k: keyof CulturalFlags) => void; disabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3">
        <p className="text-sm text-amber-800">
          <strong>Cultural considerations:</strong> Select all that apply. This helps us provide
          appropriate content warnings and cultural sensitivity guidance.
        </p>
      </div>
      {CULTURAL_GROUPS.map(g => (
        <label key={g.key} className="flex items-start gap-3 cursor-pointer group">
          <input type="checkbox" checked={data.culturalFlags[g.key]}
            onChange={() => onToggle(g.key)} disabled={disabled}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <div>
            <span className="block text-sm font-medium text-gray-900">{g.label}</span>
            <span className="block text-xs text-gray-500">{g.description}</span>
          </div>
        </label>
      ))}
    </div>
  );
}

function StepConfirm({ created, caseId, router }: {
  created: CreatedMemorial; caseId: string | null; router: ReturnType<typeof useRouter>;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-md bg-green-50 border border-green-200 px-4 py-4">
        <p className="text-sm font-semibold text-green-800 mb-1">Memorial created successfully!</p>
        <p className="text-sm text-green-700">{created.title}</p>
      </div>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Get shareable memorial link</p>
          <a href={created.memorialUrl} target="_blank" rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline break-all">{created.memorialUrl}</a>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Family upload link</p>
          <a href={created.uploadUrl} target="_blank" rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline break-all">{created.uploadUrl}</a>
        </div>
      </div>
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => router.push(`/dashboard/memorial/${created.id}/qr`)}
          className="py-2 px-5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
        >
          Open memorial dashboard →
        </button>
        {caseId && (
          <button
            onClick={() => router.push(`/dashboard/cases/${caseId}`)}
            className="py-2 px-5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ← Back to case
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

interface Props {
  prefill?: CasePrefill | null;
}

export function PrefilledMemorialForm({ prefill }: Props) {
  const router = useRouter();
  const [step,         setStep]         = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [created,      setCreated]      = useState<CreatedMemorial | null>(null);
  const [data,         setData]         = useState<FormData>(() => buildInitialData(prefill ?? null));

  function handleChange(key: keyof FormData, value: string) {
    setData(prev => ({ ...prev, [key]: value }));
  }

  function toggleFlag(key: keyof CulturalFlags) {
    setData(prev => ({
      ...prev,
      culturalFlags: { ...prev.culturalFlags, [key]: !prev.culturalFlags[key] },
    }));
  }

  function canAdvance(): boolean {
    if (step === 1) return data.firstName.trim().length > 0 && data.lastName.trim().length > 0;
    if (step === 3 && data.familyContactEmail.trim()) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.familyContactEmail.trim());
    }
    return true;
  }

  async function handleSubmit() {
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);

    try {
      let serviceTimeISO: string | undefined;
      if (data.funeralDate && data.serviceTime) {
        serviceTimeISO = new Date(`${data.funeralDate}T${data.serviceTime}`).toISOString();
      }

      const res = await fetch('/api/memorial', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName:          data.firstName.trim(),
          lastName:           data.lastName.trim(),
          preferredName:      data.preferredName.trim()      || undefined,
          dateOfBirth:        data.dateOfBirth               || undefined,
          dateOfDeath:        data.dateOfDeath               || undefined,
          placeOfPassing:     data.placeOfPassing.trim()     || undefined,
          funeralDate:        data.funeralDate               || undefined,
          serviceType:        data.serviceType               || undefined,
          serviceTime:        serviceTimeISO,
          venueName:          data.venueName.trim()          || undefined,
          venueAddress:       data.venueAddress.trim()       || undefined,
          familyContactName:  data.familyContactName.trim()  || undefined,
          familyContactEmail: data.familyContactEmail.trim() || undefined,
          familyContactPhone: data.familyContactPhone.trim() || undefined,
          ...data.culturalFlags,
        }),
      });

      // The server can answer with an HTML error page (unhandled 500) —
      // don't let res.json() blow up with "Unexpected token '<'".
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          json?.error || `Server error (${res.status}). Please try again, or contact support if it keeps happening.`,
        );
      }
      if (!json) throw new Error('Unexpected response from server. Please try again.');

      const appUrl   = window.location.origin;
      const memorial = json.data?.memorial ?? json;

      // If we have a caseId, auto-link the memorial to the case
      if (prefill?.caseId && memorial.id) {
        await fetch(`/api/org/cases/${prefill.caseId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ memorialId: memorial.id }),
        }).catch(() => {/* non-fatal — case can be linked manually */});
      }

      setCreated({
        id:              memorial.id,
        title:           memorial.title,
        uploadLinkToken: memorial.uploadLinkToken,
        uploadUrl:       `${appUrl}/upload/${memorial.uploadLinkToken}`,
        // FIXED: previously built the retired `/m/{qrTokenHash}` URL.
        // The real public URL is now /v/{slug}?key={publicToken}, but
        // publicToken doesn't exist yet at creation time — it's generated
        // lazily the first time the QR panel is opened (see
        // app/api/memorials/[id]/qr/route.ts). So this points at that QR
        // page instead of a link that would currently 400 on ?key=null;
        // opening it there generates the real token and shows the actual
        // shareable link.
        memorialUrl:     `${appUrl}/dashboard/memorial/${memorial.id}/qr`,
      });

      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create memorial');
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasPrefill = !!prefill;

  return (
    <div>
      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((s, idx) => (
            <div key={s.number} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                  step > s.number   ? 'bg-green-600 border-green-600 text-white'
                  : step === s.number ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-300 text-gray-400'
                }`}>
                  {step > s.number ? '✓' : s.number}
                </div>
                <span className={`mt-1 text-xs font-medium ${step === s.number ? 'text-blue-600' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 mb-4 transition-colors ${step > s.number ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="min-h-[320px]">
        {step === 1 && <StepDeceased data={data} onChange={handleChange} disabled={isSubmitting} prefilled={hasPrefill} />}
        {step === 2 && <StepService  data={data} onChange={handleChange} disabled={isSubmitting} />}
        {step === 3 && <StepFamily   data={data} onChange={handleChange} disabled={isSubmitting} />}
        {step === 4 && <StepCultural data={data} onToggle={toggleFlag}   disabled={isSubmitting} />}
        {step === 5 && created && <StepConfirm created={created} caseId={prefill?.caseId ?? null} router={router} />}
      </div>

      {step < 5 && (
        <div className="flex gap-3 mt-8 pt-6 border-t border-gray-200">
          {step > 1 && (
            <button type="button" onClick={() => setStep(s => s - 1)} disabled={isSubmitting}
              className="py-2 px-5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              ← Back
            </button>
          )}
          <div className="flex-1" />
          {step < 4 && (
            <button type="button" onClick={() => setStep(s => s + 1)}
              disabled={!canAdvance() || isSubmitting}
              className={`py-2 px-6 rounded-md text-sm font-medium transition-colors ${
                canAdvance() ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}>
              Next →
            </button>
          )}
          {step === 4 && (
            <button type="button" onClick={handleSubmit} disabled={isSubmitting}
              className={`py-2 px-6 rounded-md text-sm font-medium transition-colors ${
                isSubmitting ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'
              }`}>
              {isSubmitting ? 'Creating Memorial…' : 'Create Memorial'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

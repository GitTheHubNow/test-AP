'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ── Types ──────────────────────────────────────────────────────────────────

type CulturalFlags = {
  isAboriginal:           boolean;
  isTorresStraitIslander: boolean;
  isSouthSeaIslander:     boolean;
  isMaori:                boolean;
};

type ServiceType = 'BURIAL' | 'CREMATION' | 'CELEBRATION' | 'OTHER' | '';

interface FormData {
  // Step 1 — Deceased
  firstName:        string;
  lastName:         string;
  preferredName:    string;
  dateOfBirth:      string;
  dateOfDeath:      string;
  placeOfPassing:   string;
  // Step 2 — Service
  funeralDate:      string;
  serviceTime:      string;
  serviceType:      ServiceType;
  venueName:        string;
  venueAddress:     string;
  // Step 3 — Family contact
  familyContactName:  string;
  familyContactEmail: string;
  familyContactPhone: string;
  // Step 4 — Cultural
  culturalFlags: CulturalFlags;
}

interface CreatedMemorial {
  id:              string;
  title:           string;
  uploadLinkToken: string;
  uploadUrl:       string;
  memorialUrl:     string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const CULTURAL_GROUPS = [
  { key: 'isAboriginal'           as const, label: 'Aboriginal Australian',    description: 'This person identified as Aboriginal Australian' },
  { key: 'isTorresStraitIslander' as const, label: 'Torres Strait Islander',   description: 'This person identified as Torres Strait Islander' },
  { key: 'isSouthSeaIslander'     as const, label: 'South Sea Islander',        description: 'This person identified as South Sea Islander' },
  { key: 'isMaori'                as const, label: 'Māori',                     description: 'This person identified as Māori' },
];

const SERVICE_TYPES: { value: ServiceType; label: string }[] = [
  { value: '',            label: 'Select service type…' },
  { value: 'BURIAL',      label: 'Burial' },
  { value: 'CREMATION',   label: 'Cremation' },
  { value: 'CELEBRATION', label: 'Celebration of Life' },
  { value: 'OTHER',       label: 'Other' },
];

const STEPS = [
  { number: 1, label: 'Deceased' },
  { number: 2, label: 'Service' },
  { number: 3, label: 'Family' },
  { number: 4, label: 'Cultural' },
  { number: 5, label: 'Confirm' },
];

// ── Shared input styles (match existing codebase) ──────────────────────────

const inp = 'w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100';
const lbl = 'block text-sm font-medium text-gray-700 mb-1';

// ── Step components ────────────────────────────────────────────────────────

function StepDeceased({ data, onChange, disabled }: {
  data: FormData; onChange: (k: keyof FormData, v: string) => void; disabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={lbl}>First Name <span className="text-red-500">*</span></label>
          <input className={inp} type="text" value={data.firstName} maxLength={100}
            onChange={e => onChange('firstName', e.target.value)} disabled={disabled} placeholder="John" required />
        </div>
        <div>
          <label className={lbl}>Last Name <span className="text-red-500">*</span></label>
          <input className={inp} type="text" value={data.lastName} maxLength={100}
            onChange={e => onChange('lastName', e.target.value)} disabled={disabled} placeholder="Smith" required />
        </div>
      </div>
      <div>
        <label className={lbl}>Preferred Name / Nickname <span className="text-gray-400 font-normal">(optional)</span></label>
        <input className={inp} type="text" value={data.preferredName} maxLength={100}
          onChange={e => onChange('preferredName', e.target.value)} disabled={disabled} placeholder="e.g. Dad, Nan, Bluey" />
        <p className="mt-1 text-xs text-gray-500">Shown on the memorial page if different from legal name.</p>
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
          onChange={e => onChange('placeOfPassing', e.target.value)} disabled={disabled} placeholder="e.g. Brisbane, QLD" />
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
          placeholder="e.g. St Mary's Church, Pinegrove Memorial Park" />
      </div>
      <div>
        <label className={lbl}>Venue Address <span className="text-gray-400 font-normal">(optional)</span></label>
        <input className={inp} type="text" value={data.venueAddress} maxLength={300}
          onChange={e => onChange('venueAddress', e.target.value)} disabled={disabled}
          placeholder="e.g. 123 Church St, Brisbane QLD 4000" />
        <p className="mt-1 text-xs text-gray-500">Shown on the memorial page with a directions link.</p>
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
          <strong>Why we ask:</strong> After the funeral, ownership of this memorial is automatically
          transferred to the family contact. They'll receive an email with an accept link and gain
          full control of the memorial. You can skip this and configure it later.
        </p>
      </div>
      <div>
        <label className={lbl}>Family Contact Name <span className="text-gray-400 font-normal">(optional)</span></label>
        <input className={inp} type="text" value={data.familyContactName} maxLength={150}
          onChange={e => onChange('familyContactName', e.target.value)} disabled={disabled}
          placeholder="e.g. Sarah Smith" />
      </div>
      <div>
        <label className={lbl}>Family Contact Email <span className="text-gray-400 font-normal">(optional)</span></label>
        <input
          className={`${inp} ${!emailValid ? 'border-red-300 bg-red-50' : ''}`}
          type="email" value={data.familyContactEmail}
          onChange={e => onChange('familyContactEmail', e.target.value)} disabled={disabled}
          placeholder="sarah@example.com" />
        {!emailValid && <p className="mt-1 text-xs text-red-600">Please enter a valid email address.</p>}
        <p className="mt-1 text-xs text-gray-500">
          This person will receive the memorial handover link after the service.
        </p>
      </div>
      <div>
        <label className={lbl}>Family Contact Phone <span className="text-gray-400 font-normal">(optional)</span></label>
        <input className={inp} type="tel" value={data.familyContactPhone} maxLength={30}
          onChange={e => onChange('familyContactPhone', e.target.value)} disabled={disabled}
          placeholder="+61 4xx xxx xxx" />
      </div>

      {/* Existing auto-send section from old form — preserved */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-900">Auto-send memorial link <span className="text-gray-400 font-normal">(optional)</span></h3>
          <p className="text-xs text-gray-500 mt-0.5">
            The family contact above will automatically receive the memorial link after the date of passing.
            You can configure the exact timing after creating the memorial.
          </p>
        </div>
        <div className="px-4 py-3 bg-white">
          <p className="text-xs text-gray-500">
            Auto-send timing is configured from the memorial settings after creation.
            The family contact email you entered above will be used.
          </p>
        </div>
      </div>
    </div>
  );
}

function StepCultural({ data, onToggle, disabled }: {
  data: FormData; onToggle: (k: keyof CulturalFlags) => void; disabled: boolean;
}) {
  const anyFlagSet = Object.values(data.culturalFlags).some(Boolean);
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        If this person identified with any of the following groups, a cultural warning will be
        shown to visitors before they view the memorial. This follows standard Australian practice
        for content featuring deceased First Nations and Islander peoples.
      </p>
      <div className="rounded-lg border border-gray-200 overflow-hidden divide-y divide-gray-100">
        {CULTURAL_GROUPS.map(group => (
          <label key={group.key}
            className={`flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-colors ${
              data.culturalFlags[group.key] ? 'bg-amber-50' : 'bg-white hover:bg-gray-50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input type="checkbox" checked={data.culturalFlags[group.key]}
              onChange={() => onToggle(group.key)} disabled={disabled}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">{group.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{group.description}</p>
            </div>
          </label>
        ))}
      </div>
      {anyFlagSet && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3">
          <p className="text-xs text-amber-800">
            <strong>Warning will be shown.</strong> Visitors will see a full-screen cultural warning
            and must acknowledge it before viewing this memorial.
          </p>
        </div>
      )}
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button type="button" onClick={handleCopy}
      className="text-xs px-3 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors whitespace-nowrap">
      {copied ? '✓ Copied' : `Copy ${label}`}
    </button>
  );
}

function StepConfirm({ created, router }: { created: CreatedMemorial; router: ReturnType<typeof useRouter> }) {
  return (
    <div className="space-y-6">
      <div className="rounded-md bg-green-50 border border-green-200 px-4 py-4">
        <p className="text-sm font-semibold text-green-800 mb-1">✓ Memorial created</p>
        <p className="text-sm text-green-700">
          <strong>{created.title}</strong> has been set up and is ready to use.
        </p>
      </div>

      {/* Upload link */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">📸 Photo Upload Link</h3>
            <p className="text-xs text-gray-500 mt-0.5">Share with family and friends to collect photos</p>
          </div>
          <CopyButton value={created.uploadUrl} label="link" />
        </div>
        <div className="px-4 py-3 bg-white">
          <code className="text-xs text-gray-600 break-all">{created.uploadUrl}</code>
          <p className="mt-2 text-xs text-gray-500">
            Anyone with this link can upload photos. No account required.
            Share via WhatsApp, SMS, or include in service programs.
          </p>
        </div>
      </div>

      {/* Memorial link */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">🔗 Get Memorial Link</h3>
            <p className="text-xs text-gray-500 mt-0.5">Generate the shareable public link and QR code here</p>
          </div>
          <CopyButton value={created.memorialUrl} label="link" />
        </div>
        <div className="px-4 py-3 bg-white">
          <code className="text-xs text-gray-600 break-all">{created.memorialUrl}</code>
        </div>
      </div>

      <div className="flex gap-3">
        <button type="button"
          onClick={() => router.push(`/dashboard/memorial/${created.id}/photos`)}
          className="flex-1 py-2 px-4 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800">
          Go to Photo Manager →
        </button>
        <button type="button"
          onClick={() => router.push('/dashboard/memorials')}
          className="py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
          All Memorials
        </button>
      </div>
    </div>
  );
}

// ── Main wizard ────────────────────────────────────────────────────────────

export function CreateMemorialForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedMemorial | null>(null);

  const [data, setData] = useState<FormData>({
    firstName:          '',
    lastName:           '',
    preferredName:      '',
    dateOfBirth:        '',
    dateOfDeath:        '',
    placeOfPassing:     '',
    funeralDate:        '',
    serviceTime:        '',
    serviceType:        '',
    venueName:          '',
    venueAddress:       '',
    familyContactName:  '',
    familyContactEmail: '',
    familyContactPhone: '',
    culturalFlags: {
      isAboriginal:           false,
      isTorresStraitIslander: false,
      isSouthSeaIslander:     false,
      isMaori:                false,
    },
  });

  function handleChange(key: keyof FormData, value: string) {
    setData(prev => ({ ...prev, [key]: value }));
  }

  function toggleFlag(key: keyof CulturalFlags) {
    setData(prev => ({
      ...prev,
      culturalFlags: { ...prev.culturalFlags, [key]: !prev.culturalFlags[key] },
    }));
  }

  // Validate current step before advancing
  function canAdvance(): boolean {
    if (step === 1) return data.firstName.trim().length > 0 && data.lastName.trim().length > 0;
    if (step === 3) {
      if (data.familyContactEmail.trim()) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.familyContactEmail.trim());
      }
    }
    return true;
  }

  async function handleSubmit() {
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);

    try {
      // Build serviceTime datetime from funeralDate + serviceTime
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

      const appUrl = window.location.origin;
      const memorial = json.data?.memorial ?? json;

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
        // page instead of a link that would currently 400 on ?key=null.
        memorialUrl:     `${appUrl}/dashboard/memorial/${memorial.id}/qr`,
      });

      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create memorial');
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Progress bar ───────────────────────────────────────────────────────────

  return (
    <div>
      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((s, idx) => (
            <div key={s.number} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                  step > s.number  ? 'bg-green-600 border-green-600 text-white'
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

      {/* Step content */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="min-h-[320px]">
        {step === 1 && <StepDeceased data={data} onChange={handleChange} disabled={isSubmitting} />}
        {step === 2 && <StepService  data={data} onChange={handleChange} disabled={isSubmitting} />}
        {step === 3 && <StepFamily   data={data} onChange={handleChange} disabled={isSubmitting} />}
        {step === 4 && <StepCultural data={data} onToggle={toggleFlag}   disabled={isSubmitting} />}
        {step === 5 && created && <StepConfirm created={created} router={router} />}
      </div>

      {/* Navigation */}
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

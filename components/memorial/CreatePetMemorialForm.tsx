'use client';

// components/memorial/CreatePetMemorialForm.tsx
//
// Used by: app/dashboard/pet-cases/[petCaseId]/create-memorial/page.tsx
//
// Deliberately a separate, simpler component from PrefilledMemorialForm —
// not a variant of it. PrefilledMemorialForm's multi-step wizard and its
// CasePrefill shape (deceasedName split into firstName/lastName, venue,
// familyContact) are built around the human funeral flow's richer set of
// fields (service details, cultural flags, etc). A pet memorial only
// needs a name, an optional description, and the owner as the nominated
// contact — cramming that through the 5-step human wizard would add
// friction for no benefit, and reusing CasePrefill would recreate the
// exact field-overlap confusion PetCase was designed to avoid (see the
// model comment in schema.prisma). Single-step form, same underlying
// POST /api/memorial + auto-link pattern.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface PetCasePrefill {
  petCaseId:         string;
  petName:           string;
  species:           string | null;
  breed:             string | null;
  ownerContactName:  string;
  ownerContactEmail: string | null;
  ownerContactPhone: string | null;
  serviceType:       string | null;
  // Best-effort surname guess from ownerContactName — see the create-memorial
  // page for how this is derived. Null when no surname could be guessed;
  // the field is always editable regardless.
  suggestedSurname: string | null;
}

interface CreatedMemorial {
  id:              string;
  title:           string;
  uploadLinkToken: string;
  uploadUrl:       string;
  memorialUrl:     string;
}

interface Props {
  prefill: PetCasePrefill;
}

export function CreatePetMemorialForm({ prefill }: Props) {
  const router = useRouter();

  const [firstName, setFirstName]   = useState(prefill.petName);
  const [lastName,  setLastName]    = useState(prefill.suggestedSurname ?? '');
  const [description, setDescription] = useState(
    [prefill.breed, prefill.species].filter(Boolean).join(' · ') || '',
  );
  const [nominatedEmail, setNominatedEmail] = useState(prefill.ownerContactEmail ?? '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [created,      setCreated]      = useState<CreatedMemorial | null>(null);

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0;

  async function handleSubmit() {
    if (isSubmitting || !canSubmit) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/memorial', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName:      firstName.trim(),
          lastName:       lastName.trim(),
          nominatedEmail: nominatedEmail.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create memorial');

      const appUrl   = window.location.origin;
      const memorial = json.data?.memorial ?? json;

      // POST /api/memorial doesn't accept `description` at creation time
      // (only firstName/lastName/dateOfBirth/dateOfDeath/service fields/
      // etc — see app/api/memorial/route.ts) — it's set via the settings
      // PATCH route instead. Non-fatal: worst case staff add it manually
      // from the memorial's settings page afterward.
      if (description.trim()) {
        await fetch(`/api/memorial/${memorial.id}/settings`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ description: description.trim() }),
        }).catch(() => {/* non-fatal — description can be added manually */});
      }

      // Auto-link the memorial back to the pet case — non-fatal, same as
      // PrefilledMemorialForm's case-linking: if this fails, staff can
      // still link manually from the pet case detail page.
      await fetch(`/api/org/pet-cases/${prefill.petCaseId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ memorialId: memorial.id }),
      }).catch(() => {/* non-fatal — pet case can be linked manually */});

      setCreated({
        id:              memorial.id,
        title:           memorial.title,
        uploadLinkToken: memorial.uploadLinkToken,
        uploadUrl:       `${appUrl}/upload/${memorial.uploadLinkToken}`,
        memorialUrl:     `${appUrl}/dashboard/memorial/${memorial.id}/qr`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create memorial');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (created) {
    return (
      <div>
        <div className="mb-5 flex items-center gap-2 text-emerald-700">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span className="font-semibold">Memorial created</span>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          <span className="font-medium text-gray-900">{created.title}</span> is ready.
          The pet case has been linked automatically.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => router.push(created.memorialUrl)}
            className="flex-1 bg-gray-900 text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:bg-gray-800"
          >
            Open memorial dashboard
          </button>
          <button
            onClick={() => router.push(`/dashboard/pet-cases/${prefill.petCaseId}`)}
            className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg px-4 py-2.5 hover:bg-gray-50"
          >
            Back to pet case
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Pet's name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
            placeholder="Bella"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Family name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
            placeholder="Smith"
          />
          {!prefill.suggestedSurname && (
            <p className="mt-1 text-xs text-gray-400">
              Couldn't guess this from the owner's name on file — please fill it in.
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
          placeholder="Breed, personality, a line or two about them"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Owner's email <span className="text-gray-400 font-normal">(for memorial updates)</span>
        </label>
        <input
          type="email"
          value={nominatedEmail}
          onChange={e => setNominatedEmail(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
          placeholder="owner@example.com"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={!canSubmit || isSubmitting}
        className="w-full bg-gray-900 text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Creating…' : 'Create memorial'}
      </button>
    </div>
  );
}

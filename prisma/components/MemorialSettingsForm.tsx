'use client';

/**
 * components/MemorialSettingsForm.tsx
 *
 * Client form for editing memorial details.
 * Calls PATCH /api/memorial/[memorialId]/settings
 *
 * Phase 3A - Feature 3
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface InitialData {
  firstName: string;
  lastName: string;
  birthDate: string;   // 'YYYY-MM-DD' or ''
  deathDate: string;   // 'YYYY-MM-DD' or ''
  description: string;
}

interface MemorialSettingsFormProps {
  memorialId: string;
  initialData: InitialData;
  /** If true, all inputs are disabled and save is hidden */
  isLocked: boolean;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function MemorialSettingsForm({
  memorialId,
  initialData,
  isLocked,
}: MemorialSettingsFormProps) {
  const router = useRouter();

  const [form, setForm] = useState<InitialData>(initialData);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLocked || saveState === 'saving') return;

    setSaveState('saving');
    setErrorMessage('');

    try {
      const res = await fetch(`/api/memorial/${memorialId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName:   form.firstName  || undefined,
          lastName:    form.lastName   || undefined,
          birthDate:   form.birthDate  || null,
          deathDate:   form.deathDate  || null,
          description: form.description || null,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'Failed to save changes');
      }

      setSaveState('saved');
      router.refresh(); // Re-sync server component data

      setTimeout(() => setSaveState('idle'), 2500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setErrorMessage(message);
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 4000);
    }
  }

  // ---- Field styles ----
  const inputBase =
    'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm ' +
    'text-gray-900 shadow-sm placeholder:text-gray-400 ' +
    'focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ' +
    'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed';

  const labelBase = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">

      {/* Name row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="firstName" className={labelBase}>
            First Name
          </label>
          <input
            id="firstName"
            name="firstName"
            type="text"
            value={form.firstName}
            onChange={handleChange}
            disabled={isLocked}
            placeholder="First name"
            className={inputBase}
          />
        </div>
        <div>
          <label htmlFor="lastName" className={labelBase}>
            Last Name
          </label>
          <input
            id="lastName"
            name="lastName"
            type="text"
            value={form.lastName}
            onChange={handleChange}
            disabled={isLocked}
            placeholder="Last name"
            className={inputBase}
          />
        </div>
      </div>

      {/* Dates row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="birthDate" className={labelBase}>
            Date of Birth
          </label>
          <input
            id="birthDate"
            name="birthDate"
            type="date"
            value={form.birthDate}
            onChange={handleChange}
            disabled={isLocked}
            className={inputBase}
          />
        </div>
        <div>
          <label htmlFor="deathDate" className={labelBase}>
            Date of Passing
          </label>
          <input
            id="deathDate"
            name="deathDate"
            type="date"
            value={form.deathDate}
            onChange={handleChange}
            disabled={isLocked}
            className={inputBase}
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className={labelBase}>
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          value={form.description}
          onChange={handleChange}
          disabled={isLocked}
          placeholder="A brief tribute or biography…"
          className={inputBase + ' resize-y'}
        />
      </div>

      {/* Actions — hidden when locked */}
      {!isLocked && (
        <div className="flex items-center justify-between pt-2">
          <div>
            {saveState === 'error' && (
              <p className="text-sm text-red-600">{errorMessage}</p>
            )}
            {saveState === 'saved' && (
              <p className="text-sm text-green-600">Changes saved successfully.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!isDirty || saveState === 'saving'}
            className={[
              'inline-flex items-center gap-2 rounded-md px-4 py-2',
              'text-sm font-medium text-white shadow-sm',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
              !isDirty || saveState === 'saving'
                ? 'bg-indigo-300 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700',
            ].join(' ')}
          >
            {saveState === 'saving' ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12" cy="12" r="10"
                    stroke="currentColor" strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Saving…
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      )}
    </form>
  );
}

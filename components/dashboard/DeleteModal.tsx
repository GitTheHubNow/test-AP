'use client';

/**
 * components/dashboard/DeleteModal.tsx
 *
 * Confirmation modal for archiving (soft-deleting) a memorial.
 * Calls DELETE /api/memorial/[memorialId]
 * On success: redirects to /dashboard/memorials
 *
 * Usage:
 *   <DeleteModal memorialId={memorial.id} memorialTitle={memorial.title} />
 *
 * Phase 3A - Feature 4
 */

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface DeleteModalProps {
  memorialId: string;
  memorialTitle: string;
}

type DeleteState = 'idle' | 'deleting' | 'error';

export function DeleteModal({ memorialId, memorialTitle }: DeleteModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [deleteState, setDeleteState] = useState<DeleteState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmValue, setConfirmValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const CONFIRM_PHRASE = 'DELETE';
  const isConfirmed = confirmValue === CONFIRM_PHRASE;

  // Reset state + focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setConfirmValue('');
      setDeleteState('idle');
      setErrorMessage('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen && deleteState !== 'deleting') {
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, deleteState]);

  async function handleDelete() {
    if (!isConfirmed || deleteState === 'deleting') return;

    setDeleteState('deleting');
    setErrorMessage('');

    try {
      const res = await fetch(`/api/memorial/${memorialId}`, {
        method: 'DELETE',
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'Failed to archive memorial');
      }

      setIsOpen(false);
      router.push('/dashboard/memorials');
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong');
      setDeleteState('error');
    }
  }

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-300 bg-white hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
      >
        <ExclamationTriangleIcon className="h-4 w-4" aria-hidden="true" />
        Archive Memorial
      </button>

      {/* Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { if (deleteState !== 'deleting') setIsOpen(false); }}
          />

          {/* Panel */}
          <div className="relative z-10 w-full max-w-md rounded-lg bg-white shadow-xl">

            {/* Header */}
            <div className="flex items-start justify-between p-6 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 rounded-full bg-red-100 p-2">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-600" aria-hidden="true" />
                </div>
                <h2 id="delete-modal-title" className="text-lg font-semibold text-gray-900">
                  Archive Memorial
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={deleteState === 'deleting'}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 pb-4 space-y-4">
              <p className="text-sm text-gray-700">
                You are about to archive{' '}
                <span className="font-semibold">"{memorialTitle}"</span>.
              </p>

              <ul className="space-y-1 text-sm text-gray-600 list-disc list-inside">
                <li>The memorial will no longer be publicly accessible via QR</li>
                <li>All memories and media are preserved in the database</li>
                <li>This can be reversed by contacting support</li>
              </ul>

              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
                <p className="text-xs font-medium text-red-700">
                  Type <span className="font-mono font-bold">DELETE</span> to confirm
                </p>
                <input
                  ref={inputRef}
                  type="text"
                  value={confirmValue}
                  onChange={(e) => setConfirmValue(e.target.value)}
                  disabled={deleteState === 'deleting'}
                  placeholder="Type DELETE to confirm"
                  onKeyDown={(e) => { if (e.key === 'Enter' && isConfirmed) handleDelete(); }}
                  className={[
                    'mt-2 block w-full rounded border px-3 py-1.5 text-sm font-mono',
                    'placeholder:font-sans placeholder:text-gray-400',
                    'focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-60',
                    isConfirmed ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white',
                  ].join(' ')}
                />
              </div>

              {deleteState === 'error' && errorMessage && (
                <p className="text-sm text-red-600">{errorMessage}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={deleteState === 'deleting'}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 bg-white ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors focus-visible:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!isConfirmed || deleteState === 'deleting'}
                className={[
                  'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500',
                  !isConfirmed || deleteState === 'deleting'
                    ? 'bg-red-300 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-700',
                ].join(' ')}
              >
                {deleteState === 'deleting' ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Archiving…
                  </>
                ) : (
                  'Archive Memorial'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

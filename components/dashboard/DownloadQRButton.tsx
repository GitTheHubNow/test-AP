'use client';

/**
 * components/dashboard/DownloadQRButton.tsx
 *
 * Downloads the memorial QR code as a PNG file.
 *
 * Consumes: GET /api/memorial/[memorialId]/qr
 * Response:  { success: boolean, data: { qrCode: string, title: string } }
 *
 * The `qrCode` field is a base64 data URL (data:image/png;base64,...).
 * We convert it to a Blob and trigger a browser download — no page navigation.
 *
 * Usage:
 *   <DownloadQRButton memorialId={memorial.id} />
 */

import { useState } from 'react';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';

interface DownloadQRButtonProps {
  memorialId: string;
  /** Optional Tailwind classes to override or extend button styling */
  className?: string;
}

type ButtonState = 'idle' | 'loading' | 'success' | 'error';

export function DownloadQRButton({ memorialId, className = '' }: DownloadQRButtonProps) {
  const [state, setState] = useState<ButtonState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleDownload = async () => {
    if (state === 'loading') return;

    setState('loading');
    setErrorMessage('');

    try {
      const res = await fetch(`/api/memorial/${memorialId}/qr`);
      const json = await res.json();

      // Surface API-level errors
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }

      const { qrCode, title } = json.data as { qrCode: string; title: string };

      if (!qrCode) {
        throw new Error('No QR code data returned');
      }

      // --- Convert base64 data URL → Blob ---
      // data URL format: "data:image/png;base64,<payload>"
      const [header, base64] = qrCode.split(',');
      const mimeMatch = header.match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/png';
      const byteString = atob(base64);
      const byteArray = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        byteArray[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: mime });

      // --- Trigger browser download ---
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      // Derive filename from the memorial title, falling back to the ID
      const safeName = title
        ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        : memorialId;
      anchor.download = `qr-${safeName}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);

      // Brief success flash
      setState('success');
      setTimeout(() => setState('idle'), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed';
      console.error('[DownloadQRButton]', message);
      setErrorMessage(message);
      setState('error');
      setTimeout(() => setState('idle'), 3500);
    }
  };

  // ---- Derived label & styles ----

  const label: Record<ButtonState, string> = {
    idle:    'Download QR Code',
    loading: 'Generating…',
    success: 'Downloaded!',
    error:   'Failed — try again',
  };

  const stateStyles: Record<ButtonState, string> = {
    idle:
      'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50 ' +
      'disabled:opacity-60 disabled:cursor-not-allowed',
    loading:
      'bg-white text-gray-500 ring-gray-300 cursor-not-allowed opacity-75',
    success:
      'bg-green-50 text-green-700 ring-green-300',
    error:
      'bg-red-50 text-red-700 ring-red-300 hover:bg-red-100',
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleDownload}
        disabled={state === 'loading'}
        title={state === 'error' ? errorMessage : 'Download QR code as PNG'}
        aria-label="Download QR Code"
        className={[
          'inline-flex items-center gap-2 rounded-md px-3 py-2',
          'text-sm font-medium ring-1 ring-inset',
          'transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
          stateStyles[state],
          className,
        ].join(' ')}
      >
        {/* Icon — spinner when loading, download icon otherwise */}
        {state === 'loading' ? (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
        ) : (
          <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />
        )}

        {label[state]}
      </button>

      {/* Inline error detail — only visible in error state */}
      {state === 'error' && errorMessage && (
        <p className="text-xs text-red-600 pl-1">{errorMessage}</p>
      )}
    </div>
  );
}

'use client';

/**
 * components/dashboard/MemorialCard.tsx
 *
 * Displays a single memorial in the dashboard list.
 * Includes links to Moderation and Settings pages.
 * Includes the DownloadQRButton for quick QR access.
 *
 * Phase 3A compatible.
 */

import Link from 'next/link';
import { DownloadQRButton } from '@/components/dashboard/DownloadQRButton';

interface MemorialCardProps {
  memorial: {
    id: string;
    title: string;
    description: string | null;
    createdAt: string;
    status: string;
  };
}

export function MemorialCard({ memorial }: MemorialCardProps) {
  const isArchived = memorial.status === 'ARCHIVED';

  return (
    <div
      className={[
        'bg-white rounded-lg shadow p-6 transition-shadow',
        isArchived ? 'opacity-60' : 'hover:shadow-md',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-4">

        {/* Left — title, description, meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium text-gray-900 truncate">
              {memorial.title}
            </h3>
            {isArchived && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                Archived
              </span>
            )}
          </div>

          {memorial.description && (
            <p className="mt-1 text-sm text-gray-500 line-clamp-2">
              {memorial.description}
            </p>
          )}

          <p className="mt-2 text-xs text-gray-400">
            Created {new Date(memorial.createdAt).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>

        {/* Right — actions */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <div className="flex items-center gap-3">
            {!isArchived && (
              <Link
                href={`/dashboard/memorial/${memorial.id}/moderation`}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Moderation
              </Link>
            )}
            <Link
              href={`/dashboard/memorial/${memorial.id}/settings`}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              Settings
            </Link>
          </div>

          {!isArchived && (
            <DownloadQRButton memorialId={memorial.id} />
          )}
        </div>

      </div>
    </div>
  );
}

import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { MemorialSettingsForm } from '@/components/MemorialSettingsForm';
import { AppearanceSettingsForm } from '@/components/dashboard/AppearanceSettingsForm';
import { DeleteModal } from '@/components/dashboard/DeleteModal';
import { DownloadQRButton } from '@/components/dashboard/DownloadQRButton';
import Link from 'next/link';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';

interface SettingsPageProps {
  params: { memorialId: string };
}

export default async function MemorialSettingsPage({ params }: SettingsPageProps) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // FIXED: previously a manual `ownerId !== userId` check, which blocked
  // every org staff member except the literal creator. This page has an
  // edit form and a danger-zone archive action, so 'edit' is the right
  // permission level (not 'read').
  try {
    await assertMemorialAccess(params.memorialId, userId, 'edit');
  } catch {
    notFound();
  }

  const memorial = await prisma.memorial.findUnique({
    where: { id: params.memorialId },
    select: {
      id: true, title: true, firstName: true, lastName: true,
      birthDate: true, deathDate: true, description: true, sealed: true, status: true,
      settings: {
        select: {
          primaryColor: true, backgroundColor: true, fontFamily: true,
          showTimeline: true, showGallery: true, showGuestBook: true,
          showMemoryCount: true, guestBookTitle: true, guestBookPrompt: true,
        },
      },
    },
  });

  if (!memorial) notFound();

  const isLocked = memorial.sealed || memorial.status === 'ARCHIVED';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ivory)' }}>

      {/* Page header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <Link
              href={`/dashboard/memorial/${params.memorialId}/moderation`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--ash)', textDecoration: 'none', fontFamily: 'var(--font-body)', letterSpacing: '0.04em', transition: 'color 0.15s' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Memories
            </Link>
            <span style={{ color: 'var(--ivory-mid)', fontSize: '0.75rem' }}>/</span>
            <div>
              <h1 className="page-header-title">Settings</h1>
              <p className="page-header-sub">{memorial.title}</p>
            </div>
          </div>
          {memorial.status !== 'ARCHIVED' && (
            <DownloadQRButton memorialId={memorial.id} />
          )}
        </div>
      </div>

      <div className="page-body" style={{ maxWidth: '720px' }}>

        {/* Locked banners */}
        {memorial.sealed && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.875rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <div>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#92400e', fontFamily: 'var(--font-body)' }}>This memorial is sealed</p>
              <p style={{ fontSize: '0.75rem', color: '#b45309', fontFamily: 'var(--font-body)', marginTop: '0.2rem', lineHeight: 1.5 }}>
                Sealing is permanent and preserves the memorial exactly as recorded.
              </p>
            </div>
          </div>
        )}

        {memorial.status === 'ARCHIVED' && (
          <div style={{ background: 'var(--ivory-dark)', border: '1px solid var(--ivory-mid)', borderRadius: 8, padding: '0.875rem 1.25rem', marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', fontFamily: 'var(--font-body)' }}>This memorial has been archived and cannot be edited.</p>
          </div>
        )}

        {/* Section: Details */}
        <section style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
              Memorial Details
            </h2>
            <div style={{ flex: 1, height: '1px', background: 'var(--ivory-mid)' }} />
          </div>
          <div className="card" style={{ padding: '2rem' }}>
            <MemorialSettingsForm
              memorialId={memorial.id}
              initialData={{
                firstName:   memorial.firstName ?? '',
                lastName:    memorial.lastName  ?? '',
                birthDate:   memorial.birthDate ? memorial.birthDate.toISOString().split('T')[0] : '',
                deathDate:   memorial.deathDate ? memorial.deathDate.toISOString().split('T')[0] : '',
                description: memorial.description ?? '',
              }}
              isLocked={isLocked}
            />
          </div>
        </section>

        {/* Section: Appearance */}
        <section style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
              Appearance
            </h2>
            <div style={{ flex: 1, height: '1px', background: 'var(--ivory-mid)' }} />
          </div>
          <div className="card" style={{ padding: '2rem' }}>
            <AppearanceSettingsForm
              memorialId={memorial.id}
              isLocked={isLocked}
              initialData={{
                primaryColor:    memorial.settings?.primaryColor    ?? '#7c6d5a',
                backgroundColor: memorial.settings?.backgroundColor ?? '#faf8f5',
                fontFamily:      memorial.settings?.fontFamily      ?? 'Georgia, serif',
                showTimeline:    memorial.settings?.showTimeline    ?? true,
                showGallery:     memorial.settings?.showGallery     ?? true,
                showGuestBook:   memorial.settings?.showGuestBook   ?? true,
                showMemoryCount: memorial.settings?.showMemoryCount ?? true,
                guestBookTitle:  memorial.settings?.guestBookTitle  ?? '',
                guestBookPrompt: memorial.settings?.guestBookPrompt ?? '',
              }}
            />
          </div>
        </section>

        {/* Section: Danger zone */}
        {!isLocked && (
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 500, color: '#991b1b', whiteSpace: 'nowrap' }}>
                Danger Zone
              </h2>
              <div style={{ flex: 1, height: '1px', background: '#fee2e2' }} />
            </div>
            <div className="card" style={{ padding: '2rem', borderColor: '#fecaca' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--ash)', fontFamily: 'var(--font-body)', marginBottom: '1.25rem', lineHeight: 1.7 }}>
                Archiving removes this memorial from public view. All memories and media are preserved and can be restored by contacting support.
              </p>
              <DeleteModal memorialId={memorial.id} memorialTitle={memorial.title} />
            </div>
          </section>
        )}

      </div>
    </div>
  );
}

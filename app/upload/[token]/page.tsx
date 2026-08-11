import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PublicUploadForm } from '@/components/upload/PublicUploadForm';

interface Props {
  params: { token: string };
}

export default async function UploadPage({ params }: Props) {
  const memorial = await prisma.memorial.findUnique({
    where:  { uploadLinkToken: params.token },
    select: {
      id:               true,
      title:            true,
      firstName:        true,
      lastName:         true,
      preferredName:    true,
      funeralDate:      true,
      uploadLinkEnabled: true,
      workflowStage:    true,
    },
  });

  if (!memorial || !memorial.uploadLinkEnabled) notFound();

  const displayName = memorial.preferredName
    || (memorial.firstName && memorial.lastName ? `${memorial.firstName} ${memorial.lastName}` : memorial.title);

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5' }}>
      <div style={{ height: 3, background: 'linear-gradient(90deg, transparent, #c9a96e, transparent)' }} />

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>

        {/* Header */}
        <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
          <p style={{ fontSize: '0.62rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: '#c9a96e', fontFamily: 'Georgia, serif', marginBottom: '1rem' }}>
            Memoriam
          </p>
          <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(1.75rem, 5vw, 2.75rem)', fontWeight: 400, color: '#1a1714', lineHeight: 1.1, marginBottom: '0.75rem' }}>
            Share Your Photos
          </h1>
          <p style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', color: '#8a8a9a', lineHeight: 1.7 }}>
            In memory of <strong style={{ color: '#1a1714' }}>{displayName}</strong>
          </p>
          {memorial.funeralDate && (
            <p style={{ fontFamily: 'Georgia, serif', fontSize: '0.85rem', color: '#b0a898', marginTop: '0.35rem' }}>
              {new Date(memorial.funeralDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>

        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ede8e0', padding: '2rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <PublicUploadForm token={params.token} memorialId={memorial.id} />
        </div>

        <p style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.75rem', color: '#c9c2b8', fontFamily: 'Georgia, serif' }}>
          Photos are reviewed before appearing on the memorial page.
        </p>
      </div>
    </div>
  );
}

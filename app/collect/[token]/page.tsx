import { notFound } from 'next/navigation';
import { FamilyUploadForm } from '@/components/collection/FamilyUploadForm';

interface Props {
  params: { token: string };
}

async function getInvite(token: string) {
  // Validate token server-side before rendering
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/collect/${token}`,
    { cache: 'no-store' }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.data as {
    memorial:      { id: string; title: string; firstName: string | null; lastName: string | null };
    recipientName: string | null;
    expiresAt:     string;
  };
}

export default async function CollectPage({ params }: Props) {
  const invite = await getInvite(params.token);

  if (!invite) notFound();

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: 'Georgia, serif' }}>

      {/* Top bar */}
      <div style={{ height: 3, background: 'linear-gradient(90deg, transparent, #c9a96e, transparent)' }} />

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '4rem 2rem 6rem' }}>

        {/* Header */}
        <p style={{ fontSize: '0.62rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: '#c9a96e', marginBottom: '1.5rem' }}>
          In Loving Memory
        </p>
        <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 400, color: '#1a1714', lineHeight: 1.1, marginBottom: '0.5rem' }}>
          {invite.memorial.title}
        </h1>
        <p style={{ fontSize: '0.85rem', color: '#8a8a9a', marginBottom: '2.5rem', lineHeight: 1.6 }}>
          {invite.recipientName ? `Hello, ${invite.recipientName}. You've` : "You've"} been invited to share photos, stories and memories.
          Everything you upload will be reviewed before appearing on the memorial.
        </p>

        <FamilyUploadForm token={params.token} />

        <p style={{ fontSize: '0.68rem', color: '#c4bdb5', textAlign: 'center', marginTop: '3rem', letterSpacing: '0.1em' }}>
          This link expires {new Date(invite.expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}.
        </p>
      </div>
    </div>
  );
}

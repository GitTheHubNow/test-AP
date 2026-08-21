import { notFound } from 'next/navigation';
import { HandoverAcceptClient } from '@/components/handover/HandoverAcceptClient';

interface Props {
  params: Promise<{ token: string }>;
}

async function getHandover(token: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/handover/accept/${token}`,
    { cache: 'no-store' }
  );
  const data = await res.json();
  if (!res.ok) return { error: data.error as string, code: data.code as string };
  return { data: data.data as { memorial: { id: string; title: string }; familyContactName: string | null; status: string } };
}

export default async function HandoverAcceptPage({ params }: Props) {
  const { token } = await params;

  const result = await getHandover(token);

  if ('error' in result && result.code === 'INVALID') notFound();

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5' }}>
      <div style={{ height: 3, background: 'linear-gradient(90deg, transparent, #cdba93, transparent)' }} />
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '5rem 2rem' }}>

        <p style={{ fontSize: '0.62rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: '#cdba93', marginBottom: '1.5rem', fontFamily: 'Georgia, serif' }}>
          Absolute Posterity
        </p>

        {'error' in result ? (
          <div>
            <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '2rem', fontWeight: 400, color: '#1a1714', marginBottom: '1rem' }}>
              {result.code === 'COMPLETED' ? 'Already Accepted' : 'Link Unavailable'}
            </h1>
            <p style={{ fontSize: '0.9rem', color: '#98a2b3', fontFamily: 'Georgia, serif', lineHeight: 1.7 }}>
              {result.error}
            </p>
          </div>
        ) : (
          <HandoverAcceptClient
            token={token}
            memorial={result.data.memorial}
            familyContactName={result.data.familyContactName}
          />
        )}
      </div>
    </div>
  );
}

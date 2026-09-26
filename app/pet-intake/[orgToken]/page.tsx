import { notFound } from 'next/navigation';
import { prisma }   from '@/lib/prisma';
import { PetIntakeForm } from '@/components/pet-cases/PetIntakeForm';

// app/pet-intake/[orgToken]/page.tsx
//
// Public, no-auth form — the page a vet or owner lands on after scanning
// the org's printed intake QR code. Matches app/pet-tracker/[token]/page.tsx's
// approach: server component does a direct Prisma read for org branding
// (name/logo/color), since this needs to render before any form
// submission happens, unlike the API route which is POST-only and has
// no reason to expose org details on its own.
//
// Same visual language as /v/[slug], /upload/[token], /pet-tracker/[token]
// — Georgia/Cormorant Garamond serif, #faf8f5/#cdba93/#1a1714 palette —
// since this is public-facing, not staff-facing.

interface Props {
  params: Promise<{ orgToken: string }>;
}

export default async function PetIntakePage({ params }: Props) {
  const { orgToken } = await params;

  const org = await prisma.organisation.findUnique({
    where:  { petIntakeToken: orgToken },
    select: {
      id: true, name: true, brandName: true, logoUrl: true,
      primaryColor: true, featurePetAftercare: true,
    },
  });

  if (!org || !org.featurePetAftercare) notFound();

  const orgDisplayName = org.brandName || org.name;
  const accentColor    = org.primaryColor || '#cdba93';

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5' }}>
      <div style={{ height: 3, background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }} />

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>

        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          {org.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- external, org-supplied logo URL
            <img
              src={org.logoUrl}
              alt={orgDisplayName}
              style={{ maxHeight: 40, maxWidth: 180, marginBottom: '1rem', objectFit: 'contain' }}
            />
          )}
          <p style={{ fontSize: '0.62rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: accentColor, fontFamily: 'Georgia, serif', marginBottom: '1rem' }}>
            {orgDisplayName}
          </p>
          <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 400, color: '#1a1714', lineHeight: 1.15, marginBottom: '0.75rem' }}>
            Pet Intake
          </h1>
          <p style={{ fontFamily: 'Georgia, serif', fontSize: '0.95rem', color: '#98a2b3', lineHeight: 1.7 }}>
            Tell us about your pet and we'll be in touch to arrange the next steps.
          </p>
        </div>

        <PetIntakeForm orgToken={orgToken} accentColor={accentColor} />

      </div>
    </div>
  );
}

// components/legal/LegalPage.tsx
//
// Shared shell for /terms and /privacy. Server component, no client JS.
// The version/date shown comes from lib/legal.ts so the page and the consent
// record stored at onboarding (Organisation.termsAcceptedVersion) cannot drift.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CURRENT_TERMS_VERSION } from '@/lib/legal';

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', background: '#f4f1ea', padding: '3rem 1.5rem', fontFamily: "'Lora', Georgia, serif" }}>
      <article style={{ maxWidth: 760, margin: '0 auto', background: '#fdfcfa', borderRadius: 16, padding: '2.5rem', boxShadow: '0 20px 60px rgba(79,93,117,0.12)', color: '#2d2a26', lineHeight: 1.7 }}>
        <p style={{ margin: 0 }}><Link href="/" style={{ color: '#7c6d5a', fontSize: 14 }}>&larr; Absolute Posterity</Link></p>
        <h1 style={{ fontSize: 32, margin: '1rem 0 0.25rem' }}>{title}</h1>
        <p style={{ margin: '0 0 2rem', color: '#7c6d5a', fontSize: 14 }}>Last updated: {CURRENT_TERMS_VERSION}</p>
        {children}
        <p style={{ marginTop: '2.5rem', fontSize: 14, color: '#7c6d5a' }}>
          Questions? Email <a href="mailto:support@memoriam.com" style={{ color: '#7c6d5a' }}>support@memoriam.com</a>.
        </p>
      </article>
    </main>
  );
}

export const H2 = ({ children }: { children: ReactNode }) => (
  <h2 style={{ fontSize: 20, margin: '2rem 0 0.5rem' }}>{children}</h2>
);

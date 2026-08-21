import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) redirect('/dashboard/memorials');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ink)', color: 'var(--ivory)', fontFamily: 'var(--font-body)', overflow: 'hidden', position: 'relative' }}>

      {/* Background texture — faint diagonal lines */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 40px, rgba(255,255,255,0.012) 40px, rgba(255,255,255,0.012) 41px)',
        pointerEvents: 'none',
      }} />

      {/* Gold horizontal rule — top */}
      <div style={{ height: '2px', background: 'linear-gradient(90deg, transparent 0%, var(--gold) 30%, var(--gold-light) 60%, transparent 100%)', opacity: 0.7, position: 'relative', zIndex: 1 }} />

      {/* Nav */}
      <nav style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.75rem 4rem' }}>
        <div>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 600, color: 'var(--ivory)', letterSpacing: '0.04em' }}>
            Absolute Posterity
          </span>
          <span style={{ display: 'block', fontSize: '0.58rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ash)', marginTop: '1px' }}>
            Digital Memorial Platform
          </span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link href="/sign-in" className="landing-signin">
            Sign In
          </Link>
          <Link href="/sign-up" className="btn-gold">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main style={{ position: 'relative', zIndex: 1, maxWidth: '900px', margin: '0 auto', padding: '8rem 4rem 6rem' }}>

        {/* Eyebrow */}
        <p className="animate-fade-up" style={{ fontSize: '0.65rem', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '2rem', fontFamily: 'var(--font-body)' }}>
          A place of remembrance
        </p>

        {/* Headline */}
        <h1 className="animate-fade-up-1" style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(3.5rem, 7vw, 6rem)',
          fontWeight: 400,
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          color: 'var(--ivory)',
          marginBottom: '2.5rem',
        }}>
          Honour a life<br />
          <em style={{ color: 'var(--gold-light)', fontStyle: 'italic', fontWeight: 300 }}>with the dignity it deserves.</em>
        </h1>

        {/* Rule */}
        <div className="animate-fade-up-2" style={{ width: '60px', height: '1px', background: 'var(--gold)', opacity: 0.6, marginBottom: '2.5rem' }} />

        {/* Body */}
        <p className="animate-fade-up-2" style={{
          fontFamily: 'var(--font-prose)',
          fontSize: '1.15rem',
          lineHeight: 1.85,
          color: 'var(--ash-light)',
          maxWidth: '520px',
          marginBottom: '3.5rem',
        }}>
          Absolute Posterity gives families a quiet, enduring space to collect memories, share stories, and preserve the essence of those they love — for 25 years and beyond.
        </p>

        {/* CTAs */}
        <div className="animate-fade-up-3" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link href="/sign-up" className="btn-gold" style={{ padding: '0.85rem 2.25rem', fontSize: '0.85rem' }}>
            Create a Memorial
          </Link>
          <Link href="/sign-in" className="btn-ghost" style={{ padding: '0.85rem 1.75rem', fontSize: '0.85rem', borderColor: '#ffffff22', color: 'var(--ash-light)' }}>
            Sign In →
          </Link>
        </div>

        {/* Feature row */}
        <div className="animate-fade-up-4" style={{ display: 'flex', gap: '3rem', marginTop: '6rem', paddingTop: '3rem', borderTop: '1px solid #ffffff0f' }}>
          {[
            { n: '25', unit: 'Years', label: 'of secure storage' },
            { n: 'QR', unit: 'Codes', label: 'for physical tributes' },
            { n: '∞', unit: 'Memories', label: 'from family & friends' },
          ].map(f => (
            <div key={f.n}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.25rem', fontWeight: 600, color: 'var(--gold-light)', lineHeight: 1, letterSpacing: '-0.02em' }}>
                {f.n} <span style={{ fontSize: '1rem', fontWeight: 400, opacity: 0.8 }}>{f.unit}</span>
              </div>
              <div style={{ fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ash)', marginTop: '0.35rem' }}>
                {f.label}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Bottom rule */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, var(--gold), transparent)', opacity: 0.3 }} />
    </div>
  );
}

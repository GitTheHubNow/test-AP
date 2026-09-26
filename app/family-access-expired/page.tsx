export default function FamilyAccessExpiredPage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--ivory)', padding: '2rem', textAlign: 'center',
    }}>
      <div style={{ maxWidth: '440px' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400,
          color: 'var(--ink)', marginBottom: '1rem',
        }}>
          Please sign in again
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '1.15rem', lineHeight: 1.7,
          color: 'var(--ink-light)', marginBottom: '1.5rem',
        }}>
          Your session has ended, or this link is no longer valid. Please scan the
          QR code on your card again, or use the link from your email.
        </p>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--ink-muted)',
        }}>
          If you're having trouble, contact the funeral home who set up this
          memorial — they can help right away.
        </p>
      </div>
    </div>
  );
}

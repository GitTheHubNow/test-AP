'use client';

// components/pet-cases/IntakeQRActions.tsx
//
// Download / copy-link / regenerate controls for the intake QR page.
// Regenerating calls POST /api/org/pet-intake-token, which invalidates
// the old QR code — the page needs a full reload afterward to render the
// new one, since the QR image itself is generated server-side.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  qrDataUrl: string;
  intakeUrl: string;
}

export function IntakeQRActions({ qrDataUrl, intakeUrl }: Props) {
  const router = useRouter();
  const [copied,       setCopied]       = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirming,   setConfirming]   = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(intakeUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = 'pet-intake-qr.png';
    a.click();
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch('/api/org/pet-intake-token', { method: 'POST' });
      const json = await res.json();
      if (json.success) router.refresh();
    } finally {
      setRegenerating(false);
      setConfirming(false);
    }
  }

  return (
    <div>
      <div style={s.row}>
        <button onClick={handleDownload} style={s.primaryBtn}>Download PNG</button>
        <button onClick={handleCopy} style={s.secondaryBtn}>
          {copied ? 'Copied ✓' : 'Copy link'}
        </button>
      </div>

      <div style={s.dangerRow}>
        {!confirming ? (
          <button onClick={() => setConfirming(true)} style={s.dangerLink}>
            Regenerate code
          </button>
        ) : (
          <div style={s.confirmBox}>
            <p style={s.confirmText}>
              The old QR code will stop working immediately. Anything already printed
              will need to be replaced.
            </p>
            <div style={s.row}>
              <button onClick={handleRegenerate} disabled={regenerating} style={s.dangerBtn}>
                {regenerating ? 'Regenerating…' : 'Yes, regenerate'}
              </button>
              <button onClick={() => setConfirming(false)} style={s.secondaryBtn}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  row: { display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' },
  primaryBtn: { background: '#4f5d75', color: '#f0ece4', border: 'none', borderRadius: '7px', padding: '0.55rem 1.2rem', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'system-ui', cursor: 'pointer' },
  secondaryBtn: { background: 'none', border: '1px solid rgba(10,10,22,0.18)', borderRadius: '7px', padding: '0.55rem 1.2rem', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'system-ui', color: 'rgba(10,10,22,0.6)', cursor: 'pointer' },
  dangerRow: { marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(10,10,22,0.06)' },
  dangerLink: { background: 'none', border: 'none', color: 'rgba(10,10,22,0.35)', fontSize: '0.78rem', fontFamily: 'system-ui', textDecoration: 'underline', cursor: 'pointer' },
  confirmBox: { textAlign: 'left' },
  confirmText: { margin: '0 0 0.75rem', fontSize: '0.8rem', color: '#b91c1c', fontFamily: 'system-ui', lineHeight: 1.5 },
  dangerBtn: { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '7px', padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'system-ui', cursor: 'pointer' },
};

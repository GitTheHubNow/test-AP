// app/dashboard/memorial/[memorialId]/qr/page.tsx
//
// The physical/printable QR code page — these URLs get printed on
// booklets, signs, and plaques, so correctness here matters more than
// almost anywhere else in the app (a broken printed QR code can't be
// silently fixed after the fact the way a redirect can).
//
// CHANGED: previously had 4 cards — "Permanent Memorial QR" (added in a
// later phase, pointing at /v/{publicToken}) plus 3 older V1-era cards
// ("Memorial Page", "Tribute Video", "Family Upload") pointing at the
// retired /m/{memorial.id} scheme. Now down to 2 cards:
//   - Permanent Memorial QR: the only one that actually needs to exist —
//     it already shows the full memorial (gallery, guest book, memories,
//     AND tribute video, all on one page) once qrState reaches
//     MEMORIAL_OPEN. The old "Tribute Video" card's #video anchor never
//     actually existed in MemorialPageClient, so nothing is lost by
//     removing it — it was already a broken promise.
//   - Family Upload: unrelated flow (family photo submission), unchanged.
// Fixed the Permanent QR's URL to the current /v/{slug}?key={publicToken}
// shape — it was previously /v/{publicToken} with no slug, which doesn't
// match what app/v/[slug]/page.tsx actually expects.
//
// PHASE 2 CHANGE (historical) — additive only:
//   1. Added a 4th QR card: "Permanent Memorial QR" -> /v/[publicToken]
//      This is the Phase 1 lifecycle QR. Token is generated lazily here
//      (same idempotent pattern as GET /api/memorials/[id]/qr) so the
//      card always has something to show, even before the funeral home
//      visits the lifecycle panel.
//   2. Mounted <LifecyclePanel /> below the grid — client component that
//      reads/writes /api/memorials/[id]/qr (Phase 1 API).

import QRCode from 'qrcode';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import LifecyclePanel from '@/components/qr/LifecyclePanel';
import { ensurePublicToken } from '@/lib/qr';

export default async function QRPage({ params }: { params: { memorialId: string } }) {
  const { userId } = await auth();
  if (!userId) notFound();

  const memorial = await prisma.memorial.findFirst({
    where: { id: params.memorialId, ownerId: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      slug: true,
      uploadLinkToken: true,
      uploadLinkEnabled: true,
      // Phase 2: lifecycle QR token (Phase 17 field, nullable)
      publicToken: true,
    },
  });
  if (!memorial) notFound();

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const name = [memorial.firstName, memorial.lastName].filter(Boolean).join(' ') || 'Memorial';

  // ensurePublicToken (lib/qr.ts) is the single canonical lazy-generation
  // implementation — GET /api/memorials/[id]/qr, app/v/[slug]/page.tsx,
  // and this page all now share it so they can't drift out of sync.
  const publicToken = await ensurePublicToken(memorial.id, memorial.publicToken);

  const urls = {
    upload:    memorial.uploadLinkEnabled && memorial.uploadLinkToken
                 ? `${base}/upload/${memorial.uploadLinkToken}`
                 : null,
    // FIXED: previously `/v/{publicToken}` with no slug — didn't match
    // app/v/[slug]/page.tsx, which expects the slug as the path segment
    // and publicToken as the `?key=` query param.
    lifecycle: `${base}/v/${memorial.slug ?? memorial.id}?key=${publicToken}`,
  };

  const [qrUpload, qrLifecycle] = await Promise.all([
    urls.upload
      ? QRCode.toDataURL(urls.upload, { margin: 1, width: 300, color: { dark: '#1a0e05', light: '#fffdf7' } })
      : Promise.resolve(null),
    QRCode.toDataURL(urls.lifecycle, { margin: 1, width: 300, color: { dark: '#1a0e05', light: '#fffdf7' } }),
  ]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Lato:wght@300;400&display=swap');

        * { box-sizing: border-box; }

        body { margin: 0; background: #faf8f4; }

        .qr-page {
          min-height: 100vh;
          background: #faf8f4;
          font-family: 'Lato', sans-serif;
          color: #2a1f14;
          padding: 2.5rem 2rem 4rem;
        }

        .qr-header {
          text-align: center;
          margin-bottom: 3rem;
        }

        .qr-header .eyebrow {
          font-family: 'Lato', sans-serif;
          font-weight: 300;
          font-size: 0.7rem;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: #9c7c50;
          margin: 0 0 0.75rem;
        }

        .qr-header h1 {
          font-family: 'Cormorant Garamond', serif;
          font-size: 2.4rem;
          font-weight: 400;
          margin: 0 0 0.5rem;
          color: #1a0e05;
          line-height: 1.2;
        }

        .qr-header .subline {
          font-size: 0.78rem;
          color: #9c7c50;
          font-weight: 300;
          letter-spacing: 0.05em;
        }

        .divider {
          display: flex;
          align-items: center;
          gap: 1rem;
          max-width: 480px;
          margin: 2rem auto;
        }
        .divider::before, .divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: linear-gradient(to right, transparent, #c9a96e);
        }
        .divider::after { background: linear-gradient(to left, transparent, #c9a96e); }
        .divider span { font-size: 0.6rem; color: #c9a96e; letter-spacing: 0.25em; text-transform: uppercase; }

        .qr-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1.5rem;
          max-width: 900px;
          margin: 0 auto;
        }

        .qr-card {
          background: #fffdf7;
          border: 1px solid #e8dcc8;
          border-radius: 12px;
          padding: 2rem 1.5rem;
          text-align: center;
          position: relative;
          overflow: hidden;
        }

        .qr-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, #c9a96e, #e8c87e, #c9a96e);
        }

        .qr-card.permanent::before {
          background: linear-gradient(90deg, #6e9bc9, #7ec8e8, #6e9bc9);
        }

        .qr-card .card-icon {
          font-size: 1.4rem;
          margin-bottom: 0.75rem;
          display: block;
        }

        .qr-card h2 {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.3rem;
          font-weight: 600;
          margin: 0 0 0.35rem;
          color: #1a0e05;
        }

        .qr-card .card-desc {
          font-size: 0.72rem;
          color: #9c7c50;
          font-weight: 300;
          margin: 0 0 1.25rem;
          line-height: 1.5;
        }

        .qr-card img {
          width: 180px;
          height: 180px;
          border-radius: 6px;
          border: 1px solid #e8dcc8;
        }

        .qr-card .url-chip {
          margin-top: 1rem;
          font-size: 0.6rem;
          color: #b8a080;
          word-break: break-all;
          line-height: 1.4;
          font-weight: 300;
        }

        .qr-card .badge {
          display: inline-block;
          font-size: 0.58rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #6e9bc9;
          border: 1px solid #c7ddf0;
          background: #eef6fc;
          border-radius: 4px;
          padding: 0.15rem 0.5rem;
          margin-bottom: 0.6rem;
        }

        .qr-card.disabled {
          opacity: 0.5;
        }

        .qr-card.disabled .card-desc {
          color: #c4b49a;
        }

        .qr-actions {
          display: flex;
          justify-content: center;
          gap: 1rem;
          margin-top: 3rem;
          flex-wrap: wrap;
        }

        .btn-print {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1rem;
          padding: 0.75rem 2rem;
          border-radius: 6px;
          border: 1px solid #c9a96e;
          background: linear-gradient(135deg, #c9a96e, #e8c87e);
          color: #1a0e05;
          cursor: pointer;
          font-weight: 600;
          letter-spacing: 0.03em;
        }

        .btn-back {
          font-family: 'Lato', sans-serif;
          font-size: 0.78rem;
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          border: 1px solid #e8dcc8;
          background: transparent;
          color: #9c7c50;
          cursor: pointer;
          font-weight: 300;
          letter-spacing: 0.08em;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
        }

        .print-note {
          text-align: center;
          font-size: 0.68rem;
          color: #b8a080;
          margin-top: 1rem;
          font-weight: 300;
          letter-spacing: 0.05em;
        }

        @media print {
          .qr-actions, .qr-header .eyebrow, a.btn-back { display: none !important; }
          .qr-page { padding: 1rem; background: white; }
          .qr-card { break-inside: avoid; border: 1px solid #ccc; }
          .qr-card::before { display: none; }
          body { background: white; }
        }
      `}</style>

      <div className="qr-page">
        <div className="qr-header">
          <p className="eyebrow">Memoriam · QR Codes</p>
          <h1>{name}</h1>
          <p className="subline">Scan or print these codes for use at the service</p>
        </div>

        <div className="divider"><span>codes</span></div>

        <div className="qr-grid">
          {/* Permanent Lifecycle QR — the only public-memorial QR now.
              Shows pamphlet before the service, then the full memorial
              (including tribute video) automatically once qrState reaches
              MEMORIAL_OPEN. Safe to print on booklets, signs, or plaques. */}
          <div className="qr-card permanent">
            <span className="badge">Print this one</span>
            <span className="card-icon">♾</span>
            <h2>Permanent Memorial QR</h2>
            <p className="card-desc">
              One QR for life — pamphlet before the service, then the memorial
              automatically once it opens. Safe to print on booklets, signs, or plaques.
            </p>
            <img src={qrLifecycle} alt="Permanent Memorial QR Code" />
            <p className="url-chip">{urls.lifecycle}</p>
          </div>

          {/* Family Upload */}
          <div className={`qr-card${urls.upload ? '' : ' disabled'}`}>
            <span className="card-icon">📷</span>
            <h2>Family Upload</h2>
            <p className="card-desc">
              {urls.upload
                ? 'Family can scan to upload photos directly — no account needed'
                : 'Upload link is disabled for this memorial'}
            </p>
            {qrUpload
              ? <img src={qrUpload} alt="Upload QR Code" />
              : <div style={{ width: 180, height: 180, margin: '0 auto', background: '#f0ece4', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', color: '#b8a080' }}>
                  Enable upload link<br />in memorial settings
                </div>
            }
            {urls.upload && <p className="url-chip">{urls.upload}</p>}
          </div>
        </div>

        <div className="qr-actions">
          <a href={`/dashboard/memorial/${memorial.id}/settings`} className="btn-back">
            ← Settings
          </a>
          <button className="btn-print" onClick={undefined}>
            🖨 Print QR Codes
          </button>
        </div>
        <p className="print-note">Use Cmd/Ctrl+P to print · Works best on A4 or Letter paper</p>

        {/* Phase 2: Lifecycle controls — client component, calls /api/memorials/[id]/qr */}
        <LifecyclePanel memorialId={memorial.id} />

        <script dangerouslySetInnerHTML={{ __html: `
          document.querySelector('.btn-print').addEventListener('click', () => window.print());
        `}} />
      </div>
    </>
  );
}

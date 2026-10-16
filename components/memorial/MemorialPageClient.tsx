'use client';

import { useState, useRef, useEffect } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

interface Photo {
  id:      string;
  url:     string | null;
  caption: string | null;
}

interface GuestBookEntry {
  id:         string;
  authorName: string | null;
  message:    string;
  location:   string | null;
  pinned:     boolean;
  createdAt:  string;
}

interface Memory {
  id:         string;
  authorName: string | null;
  message:    string;
  featured:   boolean;
  createdAt:  string;
}

interface Memorial {
  id:          string;
  token:       string;
  displayName: string;
  firstName:   string | null;
  lastName:    string | null;
  birthDate:   string | null;
  deathDate:   string | null;
  description: string | null;
  heroUrl:     string | null;
  serviceType:    string | null;
  serviceTime:    string | null;
  venueName:      string | null;
  venueAddress:   string | null;
  placeOfPassing: string | null;
  videoUrl:    string | null;
  // ── ADDED: clean-URL slug route fields ──────────────────────────────────
  // Both optional because app/m/[token]/page.tsx (the old route, still
  // live until retired) doesn't pass these — only app/[slug]/page.tsx
  // does. publicToken + needsCookieSet together tell this component
  // whether it needs to call the unlock-cookie route on mount.
  publicToken?:    string;
  needsCookieSet?: boolean;
  settings: {
    primaryColor:    string | null;
    showGallery:     boolean;
    showGuestBook:   boolean;
    guestBookTitle:  string | null;
    guestBookPrompt: string | null;
  };
  photos:           Photo[];
  guestBookEntries: GuestBookEntry[];
  memories:         Memory[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function yearsLived(birth: string, death: string) {
  const b = new Date(birth), d = new Date(death);
  return d.getFullYear() - b.getFullYear() -
    (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate()) ? 1 : 0);
}

// ── Photo Lightbox ─────────────────────────────────────────────────────────

function Lightbox({ photos, index, onClose, onNav }: {
  photos: Photo[]; index: number; onClose: () => void; onNav: (i: number) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNav(Math.min(index + 1, photos.length - 1));
      if (e.key === 'ArrowLeft')  onNav(Math.max(index - 1, 0));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index]);

  const photo = photos[index];
  if (!photo?.url) return null;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(10,8,5,0.96)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <button onClick={onClose} style={{ position: 'fixed', top: 20, right: 24, background: 'none', border: 'none', color: '#cdba93', fontSize: '1.75rem', cursor: 'pointer', lineHeight: 1 }}>×</button>

      {index > 0 && (
        <button onClick={e => { e.stopPropagation(); onNav(index - 1); }}
          style={{ position: 'fixed', left: 20, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(201,169,110,0.3)', color: '#cdba93', borderRadius: '50%', width: 44, height: 44, cursor: 'pointer', fontSize: '1.2rem' }}>
          ‹
        </button>
      )}

      <div onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <img src={photo.url} alt={photo.caption ?? ''} style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 4 }} />
        {photo.caption && (
          <p style={{ color: '#cdba93', fontFamily: 'Georgia, serif', fontSize: '0.875rem', textAlign: 'center', fontStyle: 'italic' }}>
            {photo.caption}
          </p>
        )}
        <p style={{ color: '#5a5040', fontSize: '0.72rem' }}>{index + 1} / {photos.length}</p>
      </div>

      {index < photos.length - 1 && (
        <button onClick={e => { e.stopPropagation(); onNav(index + 1); }}
          style={{ position: 'fixed', right: 20, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(201,169,110,0.3)', color: '#cdba93', borderRadius: '50%', width: 44, height: 44, cursor: 'pointer', fontSize: '1.2rem' }}>
          ›
        </button>
      )}
    </div>
  );
}

// ── Guest book form ────────────────────────────────────────────────────────

function GuestBookForm({ token, onSubmitted }: { token: string; onSubmitted: (entry: GuestBookEntry) => void }) {
  const [name,     setName]     = useState('');
  const [message,  setMessage]  = useState('');
  const [location, setLocation] = useState('');
  const [state,    setState]    = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [errMsg,   setErrMsg]   = useState('');
  // true when the entry was accepted but is being held for review, so the
  // visitor isn't left wondering why their message isn't showing.
  const [held,     setHeld]     = useState(false);

  async function handleSubmit() {
    if (!message.trim() || state === 'submitting') return;
    setState('submitting');
    setErrMsg('');

    try {
      const res = await fetch(`/api/public/memorial/${token}/guest-book`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          authorName: name.trim()     || undefined,
          message:    message.trim(),
          location:   location.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setHeld(data.data?.entry?.status !== 'APPROVED');
      setState('done');

      if (data.data?.entry?.status === 'APPROVED') {
        onSubmitted({
          id:         data.data.entry.id,
          authorName: name.trim() || null,
          message:    message.trim(),
          location:   location.trim() || null,
          pinned:     false,
          createdAt:  data.data.entry.createdAt ?? new Date().toISOString(),
        });
      }
    } catch (e) {
      setState('error');
      setErrMsg(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '0.7rem 0.875rem',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(201,169,110,0.2)',
    borderRadius: 6, color: '#f4f1ea',
    fontFamily: 'Georgia, serif', fontSize: '0.9rem',
    outline: 'none',
  };

  if (state === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', background: 'rgba(201,169,110,0.06)', borderRadius: 10, border: '1px solid rgba(201,169,110,0.2)' }}>
        <p style={{ color: '#cdba93', fontFamily: 'Georgia, serif', fontSize: '1rem', marginBottom: '0.5rem' }}>✦ Thank you</p>
        <p style={{ color: '#8a8070', fontSize: '0.85rem', fontFamily: 'Georgia, serif' }}>
          {held
            ? 'Your message has been received and will appear once the family has had a chance to review it.'
            : 'Your message has been received.'}
        </p>
        <button onClick={() => { setState('idle'); setName(''); setMessage(''); setLocation(''); }}
          style={{ marginTop: '1rem', background: 'none', border: '1px solid rgba(201,169,110,0.3)', color: '#cdba93', fontFamily: 'Georgia, serif', fontSize: '0.8rem', padding: '0.4rem 1rem', borderRadius: 4, cursor: 'pointer' }}>
          Leave another message
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a8070', marginBottom: '0.4rem' }}>Your name</label>
          <input style={inp} type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Optional" maxLength={100} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a8070', marginBottom: '0.4rem' }}>Location</label>
          <input style={inp} type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="City, Country" maxLength={100} />
        </div>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a8070', marginBottom: '0.4rem' }}>Message <span style={{ color: '#cdba93' }}>*</span></label>
        <textarea style={{ ...inp, minHeight: 100, resize: 'vertical' }} value={message} onChange={e => setMessage(e.target.value)} placeholder="Share a memory or leave a message for the family…" maxLength={1000} />
        <p style={{ fontSize: '0.68rem', color: '#5a5040', marginTop: '0.25rem', textAlign: 'right' }}>{message.length} / 1000</p>
      </div>

      {state === 'error' && (
        <p style={{ fontSize: '0.8rem', color: '#f87171', fontFamily: 'Georgia, serif' }}>{errMsg}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!message.trim() || state === 'submitting'}
        style={{
          padding: '0.875rem', background: message.trim() ? 'rgba(201,169,110,0.15)' : 'transparent',
          border: `1px solid ${message.trim() ? '#cdba93' : 'rgba(201,169,110,0.2)'}`,
          color: message.trim() ? '#cdba93' : '#5a5040',
          fontFamily: 'Georgia, serif', fontSize: '0.9rem', letterSpacing: '0.06em',
          borderRadius: 6, cursor: message.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
        }}>
        {state === 'submitting' ? 'Sending…' : 'Sign the Guest Book'}
      </button>
    </div>
  );
}

// ── Memory form ────────────────────────────────────────────────────────────
// Mirrors GuestBookForm above. Posts to /api/public/memorial/[token]/memory,
// which was broken (token lookup bug) until this audit pass — see that
// route's file header for details. Submitted memories are PENDING until
// staff approve them on the Moderation tab, so nothing appears here
// immediately after submitting (unlike guest book, which can auto-show).

function MemoryForm({ token, onSubmitted }: { token: string; onSubmitted: () => void }) {
  const [name,    setName]    = useState('');
  const [message, setMessage] = useState('');
  const [state,   setState]   = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [errMsg,  setErrMsg]  = useState('');

  async function handleSubmit() {
    if (!message.trim() || state === 'submitting') return;
    setState('submitting');
    setErrMsg('');

    try {
      const res = await fetch(`/api/public/memorial/${token}/memory`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          authorName: name.trim() || undefined,
          message:    message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setState('done');
      onSubmitted();
    } catch (e) {
      setState('error');
      setErrMsg(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '0.7rem 0.875rem',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(201,169,110,0.2)',
    borderRadius: 6, color: '#f4f1ea',
    fontFamily: 'Georgia, serif', fontSize: '0.9rem',
    outline: 'none',
  };

  if (state === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', background: 'rgba(201,169,110,0.06)', borderRadius: 10, border: '1px solid rgba(201,169,110,0.2)' }}>
        <p style={{ color: '#cdba93', fontFamily: 'Georgia, serif', fontSize: '1rem', marginBottom: '0.5rem' }}>✦ Thank you</p>
        <p style={{ color: '#8a8070', fontSize: '0.85rem', fontFamily: 'Georgia, serif' }}>
          Your memory has been received and will appear once reviewed.
        </p>
        <button onClick={() => { setState('idle'); setName(''); setMessage(''); }}
          style={{ marginTop: '1rem', background: 'none', border: '1px solid rgba(201,169,110,0.3)', color: '#cdba93', fontFamily: 'Georgia, serif', fontSize: '0.8rem', padding: '0.4rem 1rem', borderRadius: 4, cursor: 'pointer' }}>
          Share another memory
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      <div>
        <label style={{ display: 'block', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a8070', marginBottom: '0.4rem' }}>Your name</label>
        <input style={inp} type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Optional" maxLength={100} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a8070', marginBottom: '0.4rem' }}>Your memory <span style={{ color: '#cdba93' }}>*</span></label>
        <textarea style={{ ...inp, minHeight: 160, resize: 'vertical' }} value={message} onChange={e => setMessage(e.target.value)} placeholder="Share a story, a favourite moment, or what they meant to you…" maxLength={5000} />
        <p style={{ fontSize: '0.68rem', color: '#5a5040', marginTop: '0.25rem', textAlign: 'right' }}>{message.length} / 5000</p>
      </div>

      {state === 'error' && (
        <p style={{ fontSize: '0.8rem', color: '#f87171', fontFamily: 'Georgia, serif' }}>{errMsg}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!message.trim() || state === 'submitting'}
        style={{
          padding: '0.875rem', background: message.trim() ? 'rgba(201,169,110,0.15)' : 'transparent',
          border: `1px solid ${message.trim() ? '#cdba93' : 'rgba(201,169,110,0.2)'}`,
          color: message.trim() ? '#cdba93' : '#5a5040',
          fontFamily: 'Georgia, serif', fontSize: '0.9rem', letterSpacing: '0.06em',
          borderRadius: 6, cursor: message.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
        }}>
        {state === 'submitting' ? 'Sending…' : 'Share This Memory'}
      </button>
    </div>
  );
}

// ── Share bar ──────────────────────────────────────────────────────────────

function ShareBar({ displayName, url }: { displayName: string; url: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const waText = encodeURIComponent(`In memory of ${displayName} ${url}`);

  const btnStyle: React.CSSProperties = {
    padding: '0.45rem 1rem', borderRadius: 5,
    border: '1px solid rgba(201,169,110,0.25)', background: 'rgba(255,255,255,0.03)',
    color: '#8a8070', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'Georgia, serif',
    transition: 'border-color 0.15s, color 0.15s', letterSpacing: '0.04em',
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.68rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#5a5040', marginRight: '0.25rem' }}>Share</span>
      <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noreferrer">
        <button style={btnStyle}>WhatsApp</button>
      </a>
      <a href={`mailto:?subject=In memory of ${displayName}&body=${url}`}>
        <button style={btnStyle}>Email</button>
      </a>
      <button onClick={copy} style={{ ...btnStyle, borderColor: copied ? '#cdba93' : undefined, color: copied ? '#cdba93' : undefined }}>
        {copied ? '✓ Copied' : 'Copy link'}
      </button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export function MemorialPageClient({ memorial }: { memorial: Memorial }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [entries, setEntries] = useState<GuestBookEntry[]>(memorial.guestBookEntries);
  const [memorySubmitted, setMemorySubmitted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);

  // ── ADDED: set the "remembered" unlock cookie ─────────────────────────
  // Only fires when the server component (app/[slug]/page.tsx) determined
  // this visit arrived via a fresh, valid ?key= link and no cookie exists
  // yet. Runs once on mount; deliberately does not block rendering the
  // page — the visitor already has valid access for THIS request (the
  // server already verified the key), this just persists it for next
  // time. A failure here is non-fatal: worst case, they need the key in
  // the URL again next visit, not locked out of this one.
  useEffect(() => {
    if (memorial.needsCookieSet && memorial.publicToken) {
      fetch('/api/memorial-access/unlock', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ memorialId: memorial.id, key: memorial.publicToken }),
      }).catch(() => {
        // Non-fatal — see comment above.
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';

  const accent = memorial.settings.primaryColor ?? '#cdba93';

  const hasLife = memorial.birthDate || memorial.deathDate;
  const lifeLine = [
    memorial.birthDate ? formatDate(memorial.birthDate) : null,
    memorial.deathDate ? formatDate(memorial.deathDate) : null,
  ].filter(Boolean).join(' – ');

  const age = memorial.birthDate && memorial.deathDate
    ? yearsLived(memorial.birthDate, memorial.deathDate)
    : null;

  return (
    <div style={{ background: '#414d61', minHeight: '100vh', color: '#f4f1ea', fontFamily: 'Georgia, serif' }}>

      {/* ── HERO ── */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden' }}>

        {memorial.heroUrl ? (
          <div style={{ position: 'absolute', inset: 0 }}>
            <img src={memorial.heroUrl} alt={memorial.displayName}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(10,8,5,0.97) 0%, rgba(10,8,5,0.5) 50%, rgba(10,8,5,0.1) 100%)' }} />
          </div>
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 30% 40%, rgba(201,169,110,0.12) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(201,169,110,0.07) 0%, transparent 50%), #414d61' }} />
        )}

        <div style={{ position: 'relative', zIndex: 1, padding: 'clamp(2rem, 6vw, 5rem) clamp(1.5rem, 6vw, 5rem)', maxWidth: 700 }}>
          <p style={{ fontSize: '0.6rem', letterSpacing: '0.32em', textTransform: 'uppercase', color: accent, marginBottom: '1.25rem', opacity: 0.8 }}>
            In Loving Memory
          </p>

          <h1 style={{ fontFamily: '"Cormorant Garamond", "Playfair Display", Georgia, serif', fontSize: 'clamp(2.75rem, 8vw, 6rem)', fontWeight: 300, lineHeight: 1.0, letterSpacing: '-0.01em', color: '#f4f1ea', margin: '0 0 1rem' }}>
            {memorial.displayName}
          </h1>

          {hasLife && (
            <p style={{ fontSize: 'clamp(0.8rem, 1.5vw, 1rem)', color: 'rgba(201,169,110,0.75)', letterSpacing: '0.12em', marginBottom: age ? '0.25rem' : '0' }}>
              {lifeLine}
            </p>
          )}
          {age !== null && (
            <p style={{ fontSize: '0.78rem', color: 'rgba(201,169,110,0.45)', letterSpacing: '0.1em' }}>
              {age} years
            </p>
          )}
          {memorial.placeOfPassing && (
            <p style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: '#5a5040', letterSpacing: '0.06em' }}>
              {memorial.placeOfPassing}
            </p>
          )}
        </div>

        <div style={{ position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', zIndex: 1, opacity: 0.4 }}>
          <div style={{ width: 1, height: 50, background: `linear-gradient(to bottom, ${accent}, transparent)`, margin: '0 auto' }} />
        </div>
      </section>

      {/* ── SERVICE DETAILS ── */}
      {(memorial.serviceTime || memorial.venueName) && (
        <section style={{ borderTop: `1px solid rgba(201,169,110,0.15)`, borderBottom: `1px solid rgba(201,169,110,0.15)`, padding: '2.5rem clamp(1.5rem, 6vw, 5rem)' }}>
          <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', gap: '3rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '0.6rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: accent, marginBottom: '0.5rem' }}>
                {memorial.serviceType ?? 'Service'}
              </p>
              {memorial.serviceTime && (
                <p style={{ fontSize: '1.1rem', color: '#f4f1ea', marginBottom: '0.25rem' }}>
                  {new Date(memorial.serviceTime).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
              {memorial.serviceTime && (
                <p style={{ fontSize: '0.9rem', color: '#8a8070' }}>
                  {new Date(memorial.serviceTime).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </p>
              )}
            </div>
            {memorial.venueName && (
              <div>
                <p style={{ fontSize: '0.6rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: accent, marginBottom: '0.5rem' }}>Venue</p>
                <p style={{ fontSize: '1.1rem', color: '#f4f1ea', marginBottom: '0.25rem' }}>{memorial.venueName}</p>
                {memorial.venueAddress && (
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(memorial.venueAddress)}`}
                    target="_blank" rel="noreferrer"
                    style={{ fontSize: '0.8rem', color: accent, textDecoration: 'none', opacity: 0.7 }}>
                    {memorial.venueAddress} ↗
                  </a>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 clamp(1.5rem, 6vw, 5rem)' }}>

        {/* ── TRIBUTE VIDEO ── */}
        {memorial.videoUrl && (
          <section style={{ padding: '5rem 0' }}>
            <p style={{ fontSize: '0.6rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: accent, marginBottom: '1.5rem' }}>
              Tribute
            </p>
            <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#000', aspectRatio: '16/9', border: `1px solid rgba(201,169,110,0.15)` }}>
              <video
                ref={videoRef}
                src={memorial.videoUrl}
                muted={!videoPlaying}
                playsInline
                poster={memorial.heroUrl ?? undefined}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onPlay={() => setVideoPlaying(true)}
                onPause={() => setVideoPlaying(false)}
              />
              {!videoPlaying && (
                <button
                  onClick={() => { videoRef.current?.play(); }}
                  style={{
                    position: 'absolute', inset: 0, background: 'transparent', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(201,169,110,0.15)', border: `1px solid ${accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                    <div style={{ width: 0, height: 0, borderTop: '12px solid transparent', borderBottom: '12px solid transparent', borderLeft: `18px solid ${accent}`, marginLeft: 4 }} />
                  </div>
                </button>
              )}
            </div>
          </section>
        )}

        {/* ── BIOGRAPHY ── */}
        {memorial.description && (
          <section style={{ padding: '5rem 0', borderTop: `1px solid rgba(201,169,110,0.1)` }}>
            <p style={{ fontSize: '0.6rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: accent, marginBottom: '1.5rem' }}>
              Biography
            </p>
            <div style={{ maxWidth: 600 }}>
              {memorial.description.split('\n\n').map((para, i) => (
                <p key={i} style={{ fontSize: 'clamp(1rem, 1.8vw, 1.125rem)', color: '#c9c2b8', lineHeight: 1.9, marginBottom: '1.25rem', fontStyle: i === 0 ? 'italic' : 'normal' }}>
                  {para}
                </p>
              ))}
            </div>
          </section>
        )}

        {/* ── MEMORIES ── */}
        <section style={{ padding: '5rem 0', borderTop: `1px solid rgba(201,169,110,0.1)` }}>
          <p style={{ fontSize: '0.6rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: accent, marginBottom: '0.5rem' }}>
            Memories
          </p>
          <p style={{ fontSize: 'clamp(1.25rem, 3vw, 1.75rem)', fontWeight: 300, color: '#f4f1ea', fontFamily: '"Cormorant Garamond", Georgia, serif', marginBottom: '2rem' }}>
            Shared by those who knew {memorial.firstName || memorial.displayName}
          </p>

          <div style={{ marginBottom: '3rem' }}>
            <MemoryForm token={memorial.token} onSubmitted={() => setMemorySubmitted(true)} />
          </div>

          {memorial.memories.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {memorial.memories.map(memory => (
                <div key={memory.id} style={{ padding: '1.5rem 1.75rem', background: 'rgba(255,255,255,0.025)', borderRadius: 8, border: `1px solid ${memory.featured ? 'rgba(201,169,110,0.35)' : 'rgba(255,255,255,0.06)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: `rgba(201,169,110,0.12)`, border: `1px solid rgba(201,169,110,0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: accent, fontWeight: 500, flexShrink: 0 }}>
                      {(memory.authorName ?? '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {memory.featured && <span style={{ fontSize: '0.65rem', color: accent }}>✦</span>}
                        <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#f4f1ea' }}>
                          {memory.authorName ?? 'Anonymous'}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.68rem', color: '#5a5040', marginTop: '0.1rem' }}>
                        {formatDateShort(memory.createdAt)}
                      </p>
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#c9c2b8', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                    {memory.message}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            !memorySubmitted && (
              <p style={{ fontSize: '0.85rem', color: '#5a5040', fontStyle: 'italic' }}>
                No memories shared yet. Be the first.
              </p>
            )
          )}
        </section>

        {/* ── GALLERY ── */}
        {memorial.settings.showGallery && memorial.photos.length > 0 && (
          <section style={{ padding: '5rem 0', borderTop: `1px solid rgba(201,169,110,0.1)` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.6rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: accent }}>
                Gallery
              </p>
              <span style={{ fontSize: '0.72rem', color: '#5a5040' }}>{memorial.photos.length} photo{memorial.photos.length !== 1 ? 's' : ''}</span>
            </div>

            <div style={{ columns: 'auto 200px', columnGap: 10 }}>
              {memorial.photos.map((photo, i) => (
                photo.url && (
                  <div key={photo.id}
                    onClick={() => setLightboxIndex(i)}
                    style={{ breakInside: 'avoid', marginBottom: 10, cursor: 'zoom-in', position: 'relative', borderRadius: 6, overflow: 'hidden', border: `1px solid rgba(201,169,110,0.1)` }}>
                    <img src={photo.url} alt={photo.caption ?? ''} loading="lazy"
                      style={{ width: '100%', display: 'block', transition: 'transform 0.3s' }}
                      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
                      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')} />
                    {photo.caption && (
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0.5rem 0.75rem', background: 'linear-gradient(transparent, rgba(10,8,5,0.8))' }}>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(245,240,232,0.75)', fontStyle: 'italic' }}>{photo.caption}</p>
                      </div>
                    )}
                  </div>
                )
              ))}
            </div>
          </section>
        )}

        {/* ── GUEST BOOK ── */}
        {memorial.settings.showGuestBook && (
          <section style={{ padding: '5rem 0', borderTop: `1px solid rgba(201,169,110,0.1)` }}>
            <p style={{ fontSize: '0.6rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: accent, marginBottom: '0.5rem' }}>
              {memorial.settings.guestBookTitle ?? 'Guest Book'}
            </p>
            <p style={{ fontSize: 'clamp(1.25rem, 3vw, 1.75rem)', fontWeight: 300, color: '#f4f1ea', fontFamily: '"Cormorant Garamond", Georgia, serif', marginBottom: '0.75rem' }}>
              Leave a message for the family
            </p>
            {memorial.settings.guestBookPrompt && (
              <p style={{ fontSize: '0.875rem', color: '#8a8070', marginBottom: '2rem', fontStyle: 'italic' }}>
                {memorial.settings.guestBookPrompt}
              </p>
            )}

            <div style={{ marginBottom: '3rem' }}>
              <GuestBookForm token={memorial.token} onSubmitted={e => setEntries(prev => [e, ...prev])} />
            </div>

            {entries.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {entries.map(entry => (
                  <div key={entry.id} style={{ padding: '1.25rem 1.5rem', background: 'rgba(255,255,255,0.025)', borderRadius: 8, border: `1px solid ${entry.pinned ? `rgba(201,169,110,0.35)` : 'rgba(255,255,255,0.06)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: `rgba(201,169,110,0.12)`, border: `1px solid rgba(201,169,110,0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: accent, fontWeight: 500, flexShrink: 0 }}>
                        {(entry.authorName ?? '?')[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {entry.pinned && <span style={{ fontSize: '0.65rem', color: accent }}>📌</span>}
                          <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#f4f1ea' }}>
                            {entry.authorName ?? 'Anonymous'}
                          </span>
                          {entry.location && (
                            <span style={{ fontSize: '0.72rem', color: '#5a5040' }}>· {entry.location}</span>
                          )}
                        </div>
                        <p style={{ margin: 0, fontSize: '0.68rem', color: '#5a5040', marginTop: '0.1rem' }}>
                          {formatDateShort(entry.createdAt)}
                        </p>
                      </div>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#c9c2b8', lineHeight: 1.75, fontStyle: 'italic' }}>
                      "{entry.message}"
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── SHARE ── */}
        <section style={{ padding: '3rem 0 5rem', borderTop: `1px solid rgba(201,169,110,0.1)` }}>
          <ShareBar displayName={memorial.displayName} url={pageUrl} />
        </section>

      </div>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid rgba(201,169,110,0.08)`, padding: '1.5rem clamp(1.5rem, 6vw, 5rem)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <p style={{ fontSize: '0.7rem', color: '#3a3028', letterSpacing: '0.08em' }}>
          {memorial.displayName} · Forever remembered
        </p>
        <p style={{ fontSize: '0.65rem', color: '#2a2018', letterSpacing: '0.06em' }}>
          Absolute Posterity
        </p>
      </footer>

      {lightboxIndex !== null && (
        <Lightbox
          photos={memorial.photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNav={setLightboxIndex}
        />
      )}
    </div>
  );
}

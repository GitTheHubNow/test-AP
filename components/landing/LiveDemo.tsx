'use client';

// "Try the real flow." — a three-step interactive walk-through of the product:
// create the memorial, approve tributes, hand over to the family and see the
// margin. Pure demo state: it never talks to the server and stores nothing.
//
// Differences from the original design file:
//  · built with React JSX, not innerHTML — visitor-typed text is escaped by
//    construction (no hand-rolled esc()), so markup typed into the name field
//    renders as text.
//  · timers and animation frames are cleaned up on unmount / reset.
//  · reduced-motion visitors see the final margin immediately.
//  · figures come from lib/landing/pricing so copy, ledger and calculator agree.

import { useEffect, useId, useRef, useState } from 'react';
import { CULTURES, useLandingState } from './LandingState';
import { initials, qrPathData, slugify } from '@/lib/landing/qr';
import { RETAIL_DEFAULT, WHOLESALE_FEE, formatUsd, marginPerMemorial } from '@/lib/landing/pricing';

interface Tribute { by: string; t: string; flag?: string }
const TRIBUTES: Tribute[] = [
  { by: 'Marcus Vance', t: 'A wonderful soul who always made time for the community.' },
  { by: 'Priya N.', t: 'Thank you for every Sunday scone, Nell. We will miss you.' },
  { by: 'unknown-sender', t: 'WIN a FREE cruise!! Click bit.ly/x9 now', flag: 'Auto-flagged as spam' },
];

type Phase = 'idle' | 'sending' | 'sent' | 'handed';
const STEPS = [
  { n: 1, title: 'Create the memorial', blurb: 'Five short steps: deceased, service, family, cultural, confirm.' },
  { n: 2, title: 'Collect and curate', blurb: 'One upload link. Review before anything is published.' },
  { n: 3, title: 'Hand over to the family', blurb: 'They accept by email link. You keep the margin.' },
] as const;

// A made-up sample link. (The original design file used a real-looking v4 UUID;
// a marketing page should never show something that could be a live upload token.)
const SAMPLE_UPLOAD_LINK = '/upload/7f3c2a91-0d4e-4b8a-9c15-e2a6b1d83f47';
const ADVISORY_TEXT = 'Aboriginal and Torres Strait Islander visitors are advised that this memorial contains images, voices and names of a deceased person.';

export function LiveDemo() {
  const { cultural, advisoryOn, setCulture } = useLandingState();
  const uid = useId();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('Eleanor Hawthorne');
  const [dates, setDates] = useState('1941 – 2026');
  const [home, setHome] = useState('Hartley & Sons Funerals');
  const [done, setDone] = useState<Record<number, 'Approved' | 'Declined'>>({});
  const [wall, setWall] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [shown, setShown] = useState<number | null>(null); // animated margin, null = "–"

  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raf = useRef<number | null>(null);
  useEffect(() => () => {
    if (sendTimer.current) clearTimeout(sendTimer.current);
    if (raf.current) cancelAnimationFrame(raf.current);
  }, []);

  const margin = marginPerMemorial(RETAIL_DEFAULT);

  function approve(i: number) { setDone((d) => ({ ...d, [i]: 'Approved' })); setWall((w) => [...w, i]); }
  function decline(i: number) { setDone((d) => ({ ...d, [i]: 'Declined' })); }

  function onHandover() {
    if (phase === 'idle') {
      setPhase('sending');
      sendTimer.current = setTimeout(() => setPhase('sent'), 900);
      return;
    }
    if (phase !== 'sent') return;
    setPhase('handed');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(margin); return; }
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min((t - t0) / 900, 1);
      setShown(Math.round(margin * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }

  function reset() {
    if (sendTimer.current) clearTimeout(sendTimer.current);
    if (raf.current) cancelAnimationFrame(raf.current);
    setPhase('idle'); setWall([]); setDone({}); setShown(null);
  }

  // ── derived preview values ────────────────────────────────────────────────
  const shownName = name.trim() || 'Your loved one';
  const slug = slugify(shownName);
  const handed = phase === 'handed';
  const chip = handed ? 'Owned by Sarah Hawthorne'
    : phase === 'sent' ? 'Handover sent, awaiting family'
    : `Staged by ${home || 'Your funeral home'}`;
  const ledgerLabel = handed ? 'Your margin, banked' : phase === 'sent' ? 'Waiting on the family' : 'Your margin';
  const buttonLabel = phase === 'sending' ? 'Sending…' : phase === 'sent' ? 'Family opens the accept link' : 'Send accept link';

  return (
    <div className="demo rv">
      <div>
        <div className="steps">
          {STEPS.map((s) => (
            <button
              key={s.n}
              type="button"
              className={`stp ${step === s.n ? 'on' : ''}`}
              aria-current={step === s.n ? 'step' : undefined}
              onClick={() => setStep(s.n)}
            >
              <i className="n" aria-hidden="true">{s.n}</i>
              <div><b>{s.title}</b><span>{s.blurb}</span></div>
            </button>
          ))}
        </div>

        {/* ── Step 1 ── */}
        <div className={`panel ${step === 1 ? '' : 'hidden'}`}>
          <label htmlFor={`${uid}-nm`}>Name</label>
          <input type="text" id={`${uid}-nm`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <label htmlFor={`${uid}-dt`}>Life dates</label>
          <input type="text" id={`${uid}-dt`} value={dates} maxLength={24} onChange={(e) => setDates(e.target.value)} />
          <label htmlFor={`${uid}-hm`}>Your funeral home</label>
          <input type="text" id={`${uid}-hm`} value={home} maxLength={40} onChange={(e) => setHome(e.target.value)} />
          <p className="lbl" id={`${uid}-cult`}>Cultural advisory, shown before visitors view the memorial</p>
          <div role="group" aria-labelledby={`${uid}-cult`}>
            {CULTURES.map((c, i) => (
              <label key={c} className="tg">
                <input type="checkbox" checked={cultural[i]} onChange={(e) => setCulture(i, e.target.checked)} /> {c}
              </label>
            ))}
          </div>
          <p className="tip">Add a service date to unlock photos, tribute video and the guest book.</p>
        </div>

        {/* ── Step 2 ── */}
        <div className={`panel ${step === 2 ? '' : 'hidden'}`}>
          <p className="tip" style={{ margin: '0 0 8px' }}>Share this link by WhatsApp, SMS or on the service program. No account needed.</p>
          <div className="lk">{SAMPLE_UPLOAD_LINK}</div>
          <div>
            {TRIBUTES.map((x, i) => (
              <div key={x.by} className={`tr ${x.flag ? 'fl' : ''}`}>
                <b>{x.by}</b>
                <small>{x.flag ?? 'Pending review'}</small>
                “{x.t}”
                {done[i] ? (
                  <small style={{ marginTop: 8, color: 'var(--gold)' }}>{done[i]}</small>
                ) : (
                  <div className="a">
                    <button type="button" className="sm ok" onClick={() => approve(i)}>Approve</button>
                    <button type="button" className="sm" onClick={() => decline(i)}>Decline</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Step 3 ── */}
        <div className={`panel ${step === 3 ? '' : 'hidden'}`}>
          <label htmlFor={`${uid}-fc`}>Family contact</label>
          <input type="text" id={`${uid}-fc`} value="Sarah Hawthorne · sarah@example.com" readOnly />
          <p className="lbl" id={`${uid}-when`}>When to transfer ownership</p>
          <div role="radiogroup" aria-labelledby={`${uid}-when`}>
            <label className="tg"><input type="radio" name={`${uid}-when`} defaultChecked /> Manual: I send the accept link</label>
            <label className="tg"><input type="radio" name={`${uid}-when`} /> Scheduled: transfer on a set date</label>
            <label className="tg"><input type="radio" name={`${uid}-when`} /> Immediate: family accepts via link</label>
          </div>
          <p className="tip">After the family accepts, your funeral home no longer manages the memorial. The public link stays the same.</p>
          <div className="ledger" aria-live="polite">
            <div><span>Family pays your price</span><b>{formatUsd(RETAIL_DEFAULT)}</b></div>
            <div><span>Wholesale fee to Absolute Posterity</span><b>−{formatUsd(WHOLESALE_FEE)}</b></div>
            <div className="k"><span>{ledgerLabel}</span><b>{shown === null ? '–' : `+${formatUsd(shown)}`}</b></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            {!handed && (
              <button type="button" className="btn p" disabled={phase === 'sending'} onClick={onHandover}>{buttonLabel}</button>
            )}
            {handed && <button type="button" className="btn" onClick={reset}>Start over</button>}
          </div>
        </div>
      </div>

      {/* ── Live preview of the public memorial page ── */}
      <div className="frame">
        <div className="bar"><i /><i /><i /><span>🔒 {slug}.absoluteposterity.com</span></div>
        <div className="mem">
          <span className={`chip ${handed ? 'f' : ''}`}>{chip}</span>
          {advisoryOn && <div className="adv">{ADVISORY_TEXT}</div>}
          <div className="mono" aria-hidden="true">{initials(shownName)}</div>
          <div className="flame s" style={{ margin: '0 auto 14px' }} />
          <h3>{shownName}</h3>
          <div className="d">{dates}</div>
          <div className="wall">
            {wall.length > 0
              ? wall.map((i) => (
                  <p key={i}>“{TRIBUTES[i].t}”<small>{TRIBUTES[i].by}</small></p>
                ))
              : <p className="em">No tributes yet. Approved messages appear here.</p>}
          </div>
          <div className="qr">
            <svg viewBox="-1 -1 23 23" aria-hidden="true">
              <rect x="-1" y="-1" width="23" height="23" fill="#f6f1e7" />
              <path d={qrPathData(slug)} fill="#0f131a" fillRule="evenodd" />
            </svg>
            <div>Scan at the graveside or on the order of service to visit this page.</div>
          </div>
          <div className="foot">
            {handed ? 'Hosted until 2051 · 5 GB · Support by Absolute Posterity' : `Curated by ${home || 'Your funeral home'} · Service Sat 24 Oct, 11am`}
          </div>
        </div>
      </div>
    </div>
  );
}

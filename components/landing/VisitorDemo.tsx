'use client';

// "What families and guests see." — a miniature of the public memorial page the
// visitor controls can restyle live, plus working memory / guest-book forms whose
// new messages "wait for approval", exactly as they do for a real funeral home
// (the platform now holds public posts for review by default).
// Demo state only; nothing is sent anywhere.

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';

type ThemeKey = 'light' | 'warm' | 'slate' | 'dark';
// [page bg, text, muted, card, line]
const THEMES: Record<ThemeKey, [string, string, string, string, string]> = {
  light: ['#fafaf8', '#1c1917', '#6b6560', '#ffffff', '#e7e2d9'],
  warm:  ['#f7efe2', '#3b2f22', '#7a6a58', '#fffaf0', '#e3d4bb'],
  slate: ['#eef2f7', '#1e293b', '#64748b', '#ffffff', '#d5dce6'],
  dark:  ['#14110f', '#f2ece3', '#a79e92', '#1e1a17', '#332d27'],
};
const THEME_LABELS: Record<ThemeKey, string> = { light: 'Light', warm: 'Warm', slate: 'Slate', dark: 'Dark' };
const ACCENTS = [
  { name: 'Taupe', hex: '#7c6d5a' }, { name: 'Navy', hex: '#1e3a5f' }, { name: 'Forest', hex: '#1f4d3a' },
  { name: 'Burgundy', hex: '#7a1f2e' }, { name: 'Amber', hex: '#b45309' }, { name: 'Teal', hex: '#0f766e' },
];

interface Entry { id: number; name: string; meta: string; text: string }

export function VisitorDemo() {
  const uid = useId();
  const [theme, setTheme] = useState<ThemeKey>('warm');
  const [accent, setAccent] = useState(ACCENTS[0].hex);
  const [showCount, setShowCount] = useState(true);
  const [showGallery, setShowGallery] = useState(true);
  const [showGuestBook, setShowGuestBook] = useState(true);

  const nextId = useRef(100);
  const [memories, setMemories] = useState<Entry[]>([
    { id: 1, name: 'Marcus Vance', meta: '30 Sept 2026', text: 'A wonderful soul who always made time for the community.' },
    { id: 2, name: 'Priya N.', meta: '30 Sept 2026', text: 'Thank you for every Sunday scone, Nell.' },
  ]);
  const [guestBook, setGuestBook] = useState<Entry[]>([
    { id: 3, name: 'Helen and Tom', meta: 'Brisbane QLD · 14 Oct 2026', text: 'Thinking of you all.' },
  ]);

  const [memName, setMemName] = useState('');
  const [memText, setMemText] = useState('');
  const [gbName, setGbName] = useState('');
  const [gbPlace, setGbPlace] = useState('');
  const [gbText, setGbText] = useState('');

  const [toast, setToast] = useState<{ msg: string; on: boolean }>({ msg: '', on: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const say = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, on: true });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, on: false })), 2200);
  };

  function shareMemory() {
    const text = memText.trim();
    if (!text) return say('Write a memory first');
    setMemories((m) => [{ id: nextId.current++, name: memName.trim() || 'Anonymous', meta: 'Just now · awaiting approval', text }, ...m]);
    setMemText('');
    say('Thank you. Your message is awaiting approval.');
  }
  function signGuestBook() {
    const text = gbText.trim();
    if (!text) return say('Write a message first');
    const place = gbPlace.trim();
    setGuestBook((g) => [{ id: nextId.current++, name: gbName.trim() || 'Anonymous', meta: `${place ? `${place} · ` : ''}Just now · awaiting approval`, text }, ...g]);
    setGbText('');
    say('Thank you. Your message is awaiting approval.');
  }

  const [pb, pt, pm, pc, pl] = THEMES[theme];
  const vars = { ['--pb' as string]: pb, ['--pt' as string]: pt, ['--pm' as string]: pm, ['--pc' as string]: pc, ['--pl' as string]: pl, ['--pa' as string]: accent } as CSSProperties;

  return (
    <div className="vis rv">
      <div className="ctl">
        <p className="h" id={`${uid}-mode`}>Colour mode</p>
        <div className="opts" role="group" aria-labelledby={`${uid}-mode`}>
          {(Object.keys(THEMES) as ThemeKey[]).map((k) => (
            <button key={k} type="button" className={`sm ${theme === k ? 'ok' : ''}`} aria-pressed={theme === k} onClick={() => setTheme(k)}>{THEME_LABELS[k]}</button>
          ))}
        </div>
        <p className="h" id={`${uid}-acc`}>Accent colour</p>
        <div className="opts" role="group" aria-labelledby={`${uid}-acc`}>
          {ACCENTS.map((a) => (
            <button key={a.hex} type="button" className={`sw2 ${accent === a.hex ? 'ok' : ''}`} style={{ background: a.hex }} aria-label={a.name} aria-pressed={accent === a.hex} onClick={() => setAccent(a.hex)} />
          ))}
        </div>
        <p className="h">Visible sections</p>
        <label className="tg"><input type="checkbox" checked={showCount} onChange={(e) => setShowCount(e.target.checked)} /> Memory and photo count</label>
        <label className="tg"><input type="checkbox" checked={showGallery} onChange={(e) => setShowGallery(e.target.checked)} /> Gallery</label>
        <label className="tg"><input type="checkbox" checked={showGuestBook} onChange={(e) => setShowGuestBook(e.target.checked)} /> Guest book</label>
        <p className="tip">Try it: share a memory or sign the guest book on the page. New messages wait for approval, just as they do for your team.</p>
      </div>

      <div className="vf">
        <div className="bar"><i /><i /><i /><span>absoluteposterity.com/v/eleanor-hawthorne</span></div>
        <div className="vp" style={vars}>
          <div className="vh">
            <div className="vmn" aria-hidden="true">EH</div>
            <div style={{ fontStyle: 'italic', color: 'var(--pa)' }}>In loving memory</div>
            <h3>Eleanor Hawthorne</h3>
            <div style={{ color: 'var(--pm)' }}>1941 – 2026</div>
            <div className={showCount ? '' : 'hidden'} style={{ marginTop: 14, color: 'var(--pm)', fontSize: 14 }}>
              <b style={{ color: 'var(--pt)' }}>3</b> memories · <b style={{ color: 'var(--pt)' }}>6</b> photos
            </div>
          </div>

          <div className="sec">
            <h4>Memories</h4>
            <div className="sub">Shared by those who knew Eleanor</div>
            <input placeholder="Your name" maxLength={40} aria-label="Your name" value={memName} onChange={(e) => setMemName(e.target.value)} />
            <textarea rows={3} placeholder="Your memory" maxLength={500} aria-label="Your memory" value={memText} onChange={(e) => setMemText(e.target.value)} />
            <button type="button" className="vbt" onClick={shareMemory}>Share this memory</button>
            <div>
              {memories.map((e) => (
                <div className="ve" key={e.id}><b>{e.name}</b><small>{e.meta}</small><p>{e.text}</p></div>
              ))}
            </div>
          </div>

          <div className={`sec ${showGallery ? '' : 'hidden'}`}>
            <h4 style={{ marginTop: 26 }}>Gallery</h4>
            <div className="sub">6 photos</div>
            <div className="gg">
              {[135, 200, 60, 300, 160, 20].map((deg) => (
                <i key={deg} style={{ ['--a' as string]: `${deg}deg` } as CSSProperties} />
              ))}
            </div>
          </div>

          <div className={`sec ${showGuestBook ? '' : 'hidden'}`}>
            <h4 style={{ marginTop: 26 }}>Guest book</h4>
            <div className="sub">Leave a message for the family</div>
            <input placeholder="Your name" maxLength={40} aria-label="Guest book: your name" value={gbName} onChange={(e) => setGbName(e.target.value)} />
            <input placeholder="Location" maxLength={40} aria-label="Guest book: location" value={gbPlace} onChange={(e) => setGbPlace(e.target.value)} />
            <textarea rows={2} placeholder="Message" maxLength={300} aria-label="Guest book: message" value={gbText} onChange={(e) => setGbText(e.target.value)} />
            <button type="button" className="vbt" onClick={signGuestBook}>Sign the guest book</button>
            <div>
              {guestBook.map((e) => (
                <div className="ve" key={e.id}><b>{e.name}</b><small>{e.meta}</small><p>{e.text}</p></div>
              ))}
            </div>
          </div>

          <div className="sec">
            <div className="vshare">
              <button type="button" onClick={() => say('Opening WhatsApp')}>WhatsApp</button>
              <button type="button" onClick={() => say('Opening email')}>Email</button>
              <button type="button" onClick={() => say('Link copied')}>Copy link</button>
            </div>
            <div className="vfoot">Eleanor Hawthorne · Forever remembered<br />Absolute Posterity</div>
          </div>
        </div>
        <div id="vtoast" className={toast.on ? 'on' : ''} role="status" aria-live="polite">{toast.msg}</div>
      </div>
    </div>
  );
}

'use client';

import { useState, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AppearanceSettings {
  theme:           'light' | 'warm' | 'slate' | 'dark';
  heroLayout:      'full-bleed' | 'portrait' | 'minimal';
  fontFamily:      'serif' | 'sans' | 'elegant';
  primaryColor:    string;
  showGallery:     boolean;
  showGuestBook:   boolean;
  guestBookTitle:  string;
  guestBookPrompt: string;
}

interface Props {
  memorialId:  string;
  displayName: string;
  heroUrl:     string | null;
  initial:     Partial<AppearanceSettings>;
  publicHref:  string;
}

// ── Theme definitions ────────────────────────────────────────────────────────

const THEMES: { key: AppearanceSettings['theme']; label: string; bg: string; surface: string; text: string; sub: string; border: string }[] = [
  { key: 'light',  label: 'Light',  bg: '#fafaf9', surface: '#ffffff',  text: '#1c1917', sub: '#78716c', border: '#e7e5e4' },
  { key: 'warm',   label: 'Warm',   bg: '#fdf8f0', surface: '#fffdf7',  text: '#1c0f00', sub: '#92693a', border: '#e8dcc8' },
  { key: 'slate',  label: 'Slate',  bg: '#f1f5f9', surface: '#ffffff',  text: '#0f172a', sub: '#475569', border: '#e2e8f0' },
  { key: 'dark',   label: 'Dark',   bg: '#0f0f0f', surface: '#1a1a1a',  text: '#f5f5f4', sub: '#a8a29e', border: '#292524' },
];

const HERO_LAYOUTS: { key: AppearanceSettings['heroLayout']; label: string; desc: string }[] = [
  { key: 'full-bleed', label: 'Full Bleed',  desc: 'Image fills the top — name overlaid' },
  { key: 'portrait',   label: 'Portrait',    desc: 'Photo beside name, editorial style' },
  { key: 'minimal',    label: 'Minimal',     desc: 'No image — elegant typographic header' },
];

const FONTS: { key: AppearanceSettings['fontFamily']; label: string; stack: string; preview: string }[] = [
  { key: 'serif',   label: 'Serif',   stack: "'Playfair Display', Georgia, serif",    preview: 'Playfair Display' },
  { key: 'sans',    label: 'Modern',  stack: "'Inter', system-ui, sans-serif",        preview: 'Inter' },
  { key: 'elegant', label: 'Elegant', stack: "'Cormorant Garamond', Georgia, serif",  preview: 'Cormorant Garamond' },
];

const ACCENT_COLORS = [
  '#1c1917', '#1e3a5f', '#1a3a2a', '#3b1a1a',
  '#cdba93', '#9b4523', '#2d6a4f', '#1d4ed8',
  '#7c3aed', '#be185d', '#0f766e', '#b45309',
];

const DEFAULT: AppearanceSettings = {
  theme:           'light',
  heroLayout:      'full-bleed',
  fontFamily:      'serif',
  primaryColor:    '#1c1917',
  showGallery:     true,
  showGuestBook:   true,
  guestBookTitle:  'Guest Book',
  guestBookPrompt: 'Share a memory or message...',
};

// ── Mini preview ─────────────────────────────────────────────────────────────

function MiniPreview({ settings, displayName, heroUrl }: {
  settings:    AppearanceSettings;
  displayName: string;
  heroUrl:     string | null;
}) {
  const theme = THEMES.find(t => t.key === settings.theme) ?? THEMES[0];
  const font  = FONTS.find(f => f.key === settings.fontFamily) ?? FONTS[0];

  return (
    <div style={{
      background: theme.bg,
      borderRadius: 10,
      overflow: 'hidden',
      border: `1px solid ${theme.border}`,
      fontFamily: font.stack,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Hero area */}
      {settings.heroLayout === 'full-bleed' && (
        <div style={{ position: 'relative', height: 140, background: '#1c1917', flexShrink: 0 }}>
          {heroUrl && (
            <img src={heroUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} />
          )}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 100%)',
            display: 'flex', alignItems: 'flex-end',
            padding: '0.75rem 1rem',
          }}>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 400, color: '#fff', lineHeight: 1.2 }}>{displayName}</div>
              <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.6)', marginTop: 2, letterSpacing: '0.1em' }}>1940 — 2024</div>
            </div>
          </div>
        </div>
      )}

      {settings.heroLayout === 'portrait' && (
        <div style={{ display: 'flex', gap: '0.75rem', padding: '1rem', background: theme.surface, borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
          <div style={{ width: 60, height: 72, borderRadius: 6, overflow: 'hidden', background: theme.border, flexShrink: 0 }}>
            {heroUrl && <img src={heroUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '1rem', color: theme.text, fontWeight: 400 }}>{displayName}</div>
            <div style={{ fontSize: '0.55rem', color: theme.sub, marginTop: 3, letterSpacing: '0.08em' }}>1940 — 2024</div>
            <div style={{ marginTop: 6, width: 32, height: 2, background: settings.primaryColor, borderRadius: 999 }} />
          </div>
        </div>
      )}

      {settings.heroLayout === 'minimal' && (
        <div style={{ padding: '1.5rem 1rem', textAlign: 'center', background: theme.surface, borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
          <div style={{ fontSize: '1.1rem', color: theme.text, fontWeight: 400, marginBottom: 4 }}>{displayName}</div>
          <div style={{ fontSize: '0.55rem', color: theme.sub, letterSpacing: '0.15em', textTransform: 'uppercase' }}>1940 — 2024</div>
          <div style={{ margin: '0.75rem auto 0', width: 40, height: 1, background: settings.primaryColor }} />
        </div>
      )}

      {/* Body preview */}
      <div style={{ padding: '0.75rem 1rem', flex: 1, overflow: 'hidden' }}>
        {/* Description placeholder */}
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ height: 8, background: theme.border, borderRadius: 4, width: '80%', marginBottom: 5 }} />
          <div style={{ height: 8, background: theme.border, borderRadius: 4, width: '65%', marginBottom: 5 }} />
          <div style={{ height: 8, background: theme.border, borderRadius: 4, width: '72%' }} />
        </div>

        {/* Gallery preview */}
        {settings.showGallery && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, marginBottom: '0.75rem' }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ aspectRatio: '1', borderRadius: 3, background: theme.border }} />
            ))}
          </div>
        )}

        {/* Guest book preview */}
        {settings.showGuestBook && (
          <div>
            <div style={{ height: 7, background: settings.primaryColor, borderRadius: 4, width: '40%', marginBottom: 6, opacity: 0.6 }} />
            <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 5, padding: '0.4rem 0.5rem' }}>
              <div style={{ height: 6, background: theme.border, borderRadius: 3, width: '60%', marginBottom: 4 }} />
              <div style={{ height: 6, background: theme.border, borderRadius: 3, width: '85%', marginBottom: 4 }} />
              <div style={{ height: 6, background: theme.border, borderRadius: 3, width: '50%' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────

export function AppearanceEditor({ memorialId, displayName, heroUrl, initial, publicHref }: Props) {
  const [settings, setSettings] = useState<AppearanceSettings>({ ...DEFAULT, ...initial });
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [activeTab, setActiveTab] = useState<'theme' | 'layout' | 'font' | 'content'>('theme');

  const update = useCallback(<K extends keyof AppearanceSettings>(key: K, value: AppearanceSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/memorial/${memorialId}/settings/appearance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  const currentTheme = THEMES.find(t => t.key === settings.theme)!;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.5rem 0.875rem',
    borderRadius: 6,
    border: 'none',
    background: active ? '#111827' : 'transparent',
    color: active ? '#fff' : '#6b7280',
    fontSize: '0.78rem',
    fontWeight: active ? 500 : 400,
    cursor: 'pointer',
    fontFamily: 'Inter, system-ui, sans-serif',
    transition: 'all 0.15s',
  });

  const sectionLabel: React.CSSProperties = {
    fontSize: '0.65rem',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#9ca3af',
    marginBottom: '0.625rem',
    display: 'block',
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@400&family=Cormorant+Garamond:wght@400;500&display=swap');

        .ae-wrap {
          display: grid;
          grid-template-columns: 340px 1fr;
          gap: 0;
          height: calc(100vh - 53px);
          font-family: 'Inter', system-ui, sans-serif;
          background: #f9fafb;
        }

        .ae-panel {
          background: #ffffff;
          border-right: 1px solid #e5e7eb;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .ae-panel-head {
          padding: 1.25rem 1.5rem 1rem;
          border-bottom: 1px solid #f3f4f6;
          flex-shrink: 0;
        }

        .ae-panel-title {
          font-size: 0.9rem;
          font-weight: 600;
          color: #111827;
          margin: 0 0 0.875rem;
        }

        .ae-tabs {
          display: flex;
          gap: 2px;
          background: #f3f4f6;
          padding: 3px;
          border-radius: 8px;
        }

        .ae-panel-body {
          flex: 1;
          overflow-y: auto;
          padding: 1.25rem 1.5rem;
        }

        .ae-section {
          margin-bottom: 1.75rem;
        }

        .ae-theme-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
        }

        .ae-theme-option {
          border: 2px solid transparent;
          border-radius: 8px;
          padding: 0.625rem 0.75rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          transition: border-color 0.15s;
          font-size: 0.78rem;
          font-weight: 500;
        }

        .ae-theme-swatch {
          width: 18px;
          height: 18px;
          border-radius: 4px;
          border: 1px solid rgba(0,0,0,0.1);
          flex-shrink: 0;
        }

        .ae-layout-option {
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          padding: 0.75rem 1rem;
          cursor: pointer;
          margin-bottom: 0.5rem;
          transition: border-color 0.15s, background 0.15s;
        }

        .ae-layout-option:hover { border-color: #d1d5db; }

        .ae-layout-name {
          font-size: 0.82rem;
          font-weight: 500;
          color: #111827;
          margin: 0 0 0.2rem;
        }

        .ae-layout-desc {
          font-size: 0.72rem;
          color: #9ca3af;
          margin: 0;
        }

        .ae-font-option {
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          padding: 0.875rem 1rem;
          cursor: pointer;
          margin-bottom: 0.5rem;
          transition: border-color 0.15s;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .ae-font-option:hover { border-color: #d1d5db; }

        .ae-color-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .ae-color-swatch {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          cursor: pointer;
          border: 2px solid transparent;
          transition: transform 0.1s;
        }

        .ae-color-swatch:hover { transform: scale(1.15); }

        .ae-toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.625rem 0;
          border-bottom: 1px solid #f3f4f6;
        }

        .ae-toggle-label {
          font-size: 0.82rem;
          color: #374151;
          font-weight: 400;
        }

        .ae-toggle {
          width: 36px;
          height: 20px;
          border-radius: 999px;
          border: none;
          cursor: pointer;
          position: relative;
          transition: background 0.2s;
          flex-shrink: 0;
        }

        .ae-toggle::after {
          content: '';
          position: absolute;
          top: 2px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          transition: left 0.2s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }

        .ae-input {
          width: 100%;
          box-sizing: border-box;
          padding: 0.55rem 0.75rem;
          border: 1px solid #e5e7eb;
          border-radius: 7px;
          font-size: 0.82rem;
          color: #111827;
          background: #fafafa;
          outline: none;
          font-family: 'Inter', system-ui, sans-serif;
          margin-top: 0.35rem;
          transition: border-color 0.15s;
        }

        .ae-input:focus { border-color: #9ca3af; background: #fff; }

        .ae-panel-footer {
          padding: 1rem 1.5rem;
          border-top: 1px solid #e5e7eb;
          flex-shrink: 0;
          display: flex;
          gap: 0.75rem;
          align-items: center;
        }

        .ae-save-btn {
          flex: 1;
          padding: 0.625rem;
          border-radius: 8px;
          border: none;
          background: #111827;
          color: #fff;
          font-size: 0.82rem;
          font-weight: 500;
          cursor: pointer;
          font-family: 'Inter', system-ui, sans-serif;
          transition: background 0.15s;
        }

        .ae-save-btn:hover { background: #1f2937; }
        .ae-save-btn:disabled { background: #e5e7eb; color: #9ca3af; cursor: not-allowed; }

        .ae-save-btn.saved { background: #16a34a; }

        .ae-preview-pane {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .ae-preview-head {
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #e5e7eb;
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }

        .ae-preview-label {
          font-size: 0.72rem;
          font-weight: 500;
          color: #6b7280;
          letter-spacing: 0.05em;
        }

        .ae-preview-body {
          flex: 1;
          overflow: auto;
          padding: 2rem;
          display: flex;
          align-items: flex-start;
          justify-content: center;
        }

        .ae-preview-frame {
          width: 375px;
          height: 640px;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 8px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
          flex-shrink: 0;
        }
      `}</style>

      <div className="ae-wrap">

        {/* ── LEFT: Controls ── */}
        <div className="ae-panel">
          <div className="ae-panel-head">
            <p className="ae-panel-title">Appearance</p>
            <div className="ae-tabs">
              {(['theme', 'layout', 'font', 'content'] as const).map(tab => (
                <button key={tab} style={tabStyle(activeTab === tab)} onClick={() => setActiveTab(tab)}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="ae-panel-body">

            {/* ── THEME tab ── */}
            {activeTab === 'theme' && (
              <>
                <div className="ae-section">
                  <span style={sectionLabel}>Colour mode</span>
                  <div className="ae-theme-grid">
                    {THEMES.map(t => (
                      <div
                        key={t.key}
                        className="ae-theme-option"
                        onClick={() => update('theme', t.key)}
                        style={{
                          background: t.surface,
                          borderColor: settings.theme === t.key ? '#111827' : '#e5e7eb',
                          color: t.text,
                        }}
                      >
                        <div className="ae-theme-swatch" style={{ background: t.bg, border: `1px solid ${t.border}` }} />
                        {t.label}
                        {settings.theme === t.key && (
                          <svg style={{ marginLeft: 'auto', flexShrink: 0 }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="ae-section">
                  <span style={sectionLabel}>Accent colour</span>
                  <div className="ae-color-grid">
                    {ACCENT_COLORS.map(color => (
                      <div
                        key={color}
                        className="ae-color-swatch"
                        onClick={() => update('primaryColor', color)}
                        style={{
                          background: color,
                          borderColor: settings.primaryColor === color ? '#111827' : 'transparent',
                          outline: settings.primaryColor === color ? '2px solid #111827' : 'none',
                          outlineOffset: 2,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── LAYOUT tab ── */}
            {activeTab === 'layout' && (
              <div className="ae-section">
                <span style={sectionLabel}>Hero layout</span>
                {HERO_LAYOUTS.map(layout => (
                  <div
                    key={layout.key}
                    className="ae-layout-option"
                    onClick={() => update('heroLayout', layout.key)}
                    style={{ borderColor: settings.heroLayout === layout.key ? '#111827' : '#e5e7eb', background: settings.heroLayout === layout.key ? '#f9fafb' : '#fff' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <p className="ae-layout-name">{layout.label}</p>
                      {settings.heroLayout === layout.key && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </div>
                    <p className="ae-layout-desc">{layout.desc}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── FONT tab ── */}
            {activeTab === 'font' && (
              <div className="ae-section">
                <span style={sectionLabel}>Typography</span>
                {FONTS.map(f => (
                  <div
                    key={f.key}
                    className="ae-font-option"
                    onClick={() => update('fontFamily', f.key)}
                    style={{ borderColor: settings.fontFamily === f.key ? '#111827' : '#e5e7eb' }}
                  >
                    <div>
                      <p style={{ margin: '0 0 0.2rem', fontSize: '0.78rem', fontWeight: 500, color: '#111827', fontFamily: 'Inter, sans-serif' }}>{f.label}</p>
                      <p style={{ margin: 0, fontFamily: f.stack, fontSize: '1.1rem', color: '#374151' }}>
                        In Loving Memory
                      </p>
                    </div>
                    {settings.fontFamily === f.key && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── CONTENT tab ── */}
            {activeTab === 'content' && (
              <>
                <div className="ae-section">
                  <span style={sectionLabel}>Sections</span>
                  <div className="ae-toggle-row">
                    <span className="ae-toggle-label">Photo gallery</span>
                    <button
                      className="ae-toggle"
                      onClick={() => update('showGallery', !settings.showGallery)}
                      style={{ background: settings.showGallery ? '#111827' : '#d1d5db' }}
                    >
                      <span style={{
                        position: 'absolute',
                        top: 2,
                        left: settings.showGallery ? 18 : 2,
                        width: 16, height: 16,
                        borderRadius: '50%',
                        background: 'white',
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </button>
                  </div>
                  <div className="ae-toggle-row">
                    <span className="ae-toggle-label">Guest book</span>
                    <button
                      className="ae-toggle"
                      onClick={() => update('showGuestBook', !settings.showGuestBook)}
                      style={{ background: settings.showGuestBook ? '#111827' : '#d1d5db' }}
                    >
                      <span style={{
                        position: 'absolute',
                        top: 2,
                        left: settings.showGuestBook ? 18 : 2,
                        width: 16, height: 16,
                        borderRadius: '50%',
                        background: 'white',
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </button>
                  </div>
                </div>

                {settings.showGuestBook && (
                  <div className="ae-section">
                    <span style={sectionLabel}>Guest book text</span>
                    <div style={{ marginBottom: '0.875rem' }}>
                      <label style={{ fontSize: '0.72rem', color: '#6b7280' }}>Title</label>
                      <input
                        className="ae-input"
                        value={settings.guestBookTitle}
                        onChange={e => update('guestBookTitle', e.target.value)}
                        placeholder="Guest Book"
                        maxLength={60}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.72rem', color: '#6b7280' }}>Prompt</label>
                      <input
                        className="ae-input"
                        value={settings.guestBookPrompt}
                        onChange={e => update('guestBookPrompt', e.target.value)}
                        placeholder="Share a memory or message..."
                        maxLength={120}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="ae-panel-footer">
            <button
              onClick={save}
              disabled={saving}
              className={`ae-save-btn${saved ? ' saved' : ''}`}
            >
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
            </button>
            <a
              href={publicHref}
              target="_blank"
              style={{ fontSize: '0.75rem', color: '#2563eb', textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              View live ↗
            </a>
          </div>
        </div>

        {/* ── RIGHT: Preview ── */}
        <div className="ae-preview-pane">
          <div className="ae-preview-head">
            <span className="ae-preview-label">LIVE PREVIEW</span>
            <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>Changes shown instantly</span>
          </div>
          <div className="ae-preview-body">
            <div className="ae-preview-frame">
              <MiniPreview
                settings={settings}
                displayName={displayName}
                heroUrl={heroUrl}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

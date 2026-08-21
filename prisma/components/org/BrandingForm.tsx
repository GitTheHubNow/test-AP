'use client';

// components/org/BrandingForm.tsx
//
// Client component for editing organisation branding.
// Calls GET /api/org/branding on mount, PATCH on save, POST /api/org/branding/logo for logo.
//
// Live preview: renders a simplified version of the MemorialShell header/footer
// using the current (unsaved) form values so funeral homes can see the effect
// before saving. This avoids needing to import the full MemorialShell server component.
//
// Fields:
//   - brandName        (text)
//   - logoUrl          (upload + clear)
//   - primaryColor     (hex colour picker + text input)
//   - secondaryColor   (hex colour picker + text input)
//   - supportEmail     (email input)
//   - poweredByEnabled (toggle)
//
// isWhiteLabelEnabled is operator-only — not shown here.

import { useState, useEffect, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Branding {
  name:                string;
  brandName:           string | null;
  logoUrl:             string | null;
  primaryColor:        string | null;
  secondaryColor:      string | null;
  supportEmail:        string | null;
  poweredByEnabled:    boolean;
  isWhiteLabelEnabled: boolean;
}

// ── Defaults matching MEMORIAM_DEFAULTS ───────────────────────────────────────

const DEFAULTS = {
  primaryColor:   '#cdba93',
  secondaryColor: '#4f5d75',
};

// ── Hex validation ────────────────────────────────────────────────────────────

function isHex(v: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(v);
}

// ── Preview component (mirrors MemorialShell header/footer) ───────────────────

function BrandPreview({
  brandName, logoUrl, primaryColor, secondaryColor, supportEmail, poweredByEnabled,
}: {
  brandName: string; logoUrl: string | null;
  primaryColor: string; secondaryColor: string;
  supportEmail: string; poweredByEnabled: boolean;
}) {
  function withAlpha(hex: string, a: number) {
    try {
      const r = parseInt(hex.slice(1,3),16);
      const g = parseInt(hex.slice(3,5),16);
      const b = parseInt(hex.slice(5,7),16);
      return `rgba(${r},${g},${b},${a})`;
    } catch { return `rgba(201,169,110,${a})`; }
  }

  return (
    <div style={{
      border:       `1px solid rgba(10,10,22,0.1)`,
      borderRadius: '8px',
      overflow:     'hidden',
      background:   secondaryColor,
      fontSize:     '0.8rem',
    }}>
      {/* Header preview */}
      <div style={{
        padding:      '0.85rem 1.25rem',
        borderBottom: `1px solid ${withAlpha(primaryColor, 0.15)}`,
        display:      'flex',
        alignItems:   'center',
      }}>
        {logoUrl ? (
          <img src={logoUrl} alt={brandName} style={{ maxHeight: 28, maxWidth: 130, objectFit: 'contain' }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: '0.5rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: primaryColor, opacity: 0.7 }}>
              Memorial Service
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 300, color: '#f4f1ea', letterSpacing: '0.04em', fontFamily: 'Georgia, serif' }}>
              {brandName || 'Your Funeral Home'}
            </span>
          </div>
        )}
      </div>

      {/* Content stub */}
      <div style={{ padding: '1rem 1.25rem' }}>
        <div style={{ height: 8, width: '60%', background: withAlpha(primaryColor, 0.15), borderRadius: 4, marginBottom: 6 }} />
        <div style={{ height: 8, width: '40%', background: withAlpha(primaryColor, 0.08), borderRadius: 4 }} />
      </div>

      {/* Footer preview */}
      {(supportEmail || poweredByEnabled) && (
        <div style={{
          borderTop:  `1px solid ${withAlpha(primaryColor, 0.08)}`,
          padding:    '0.65rem 1.25rem',
          display:    'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap:        '0.25rem',
        }}>
          {supportEmail && (
            <p style={{ margin: 0, fontSize: '0.62rem', color: '#6b7890', fontFamily: 'Arial, sans-serif' }}>
              Questions?{' '}
              <span style={{ color: primaryColor }}>{supportEmail}</span>
            </p>
          )}
          {poweredByEnabled && (
            <p style={{ margin: 0, fontSize: '0.52rem', color: '#2a2a40', letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: 'Arial, sans-serif' }}>
              Powered by Absolute Posterity
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BrandingForm() {
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [uploading,setUploading]= useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [saved,    setSaved]    = useState(false);

  // Form state
  const [orgName,          setOrgName]          = useState('');
  const [brandName,        setBrandName]        = useState('');
  const [logoUrl,          setLogoUrl]          = useState<string | null>(null);
  const [primaryColor,     setPrimaryColor]     = useState(DEFAULTS.primaryColor);
  const [secondaryColor,   setSecondaryColor]   = useState(DEFAULTS.secondaryColor);
  const [supportEmail,     setSupportEmail]     = useState('');
  const [poweredByEnabled, setPoweredByEnabled] = useState(true);
  const [isWhiteLabel,     setIsWhiteLabel]     = useState(false);

  // Colour input raw text (allows typing partial hex without rejecting)
  const [primaryRaw,   setPrimaryRaw]   = useState(DEFAULTS.primaryColor);
  const [secondaryRaw, setSecondaryRaw] = useState(DEFAULTS.secondaryColor);

  const fileRef = useRef<HTMLInputElement>(null);

  // ── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/org/branding')
      .then(r => r.json())
      .then(json => {
        if (!json.success) return;
        const b: Branding = json.data.branding;
        setOrgName(b.name);
        setBrandName(b.brandName ?? b.name);
        setLogoUrl(b.logoUrl ?? null);
        const pc = b.primaryColor   ?? DEFAULTS.primaryColor;
        const sc = b.secondaryColor ?? DEFAULTS.secondaryColor;
        setPrimaryColor(pc);   setPrimaryRaw(pc);
        setSecondaryColor(sc); setSecondaryRaw(sc);
        setSupportEmail(b.supportEmail ?? '');
        setPoweredByEnabled(b.poweredByEnabled);
        setIsWhiteLabel(b.isWhiteLabelEnabled);
      })
      .catch(() => {/* use defaults */})
      .finally(() => setLoading(false));
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    setError(null);
    setSaved(false);

    if (!isHex(primaryColor)) {
      setError('Primary colour must be a 6-digit hex value e.g. #cdba93');
      return;
    }
    if (!isHex(secondaryColor)) {
      setError('Secondary colour must be a 6-digit hex value e.g. #4f5d75');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/org/branding', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandName:        brandName.trim() || orgName,
          logoUrl:          logoUrl,
          primaryColor,
          secondaryColor,
          supportEmail:     supportEmail.trim() || null,
          poweredByEnabled,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Save failed');
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (e: any) {
      setError(e.message ?? 'Network error');
    } finally {
      setSaving(false);
    }
  }

  // ── Logo upload ────────────────────────────────────────────────────────────

  async function handleLogoUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('logo', file);
      const res  = await fetch('/api/org/branding/logo', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Logo upload failed');
      } else {
        setLogoUrl(json.data.url);
      }
    } catch (e: any) {
      setError(e.message ?? 'Upload error');
    } finally {
      setUploading(false);
    }
  }

  // ── Colour input handlers ──────────────────────────────────────────────────

  function handlePrimaryText(v: string) {
    setPrimaryRaw(v);
    if (isHex(v)) setPrimaryColor(v);
  }

  function handleSecondaryText(v: string) {
    setSecondaryRaw(v);
    if (isHex(v)) setSecondaryColor(v);
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return <p style={s.loading}>Loading branding settings…</p>;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={s.wrap}>

      {/* ── White-label status notice ── */}
      <div style={{
        ...s.notice,
        background: isWhiteLabel ? 'rgba(21,128,61,0.06)' : 'rgba(10,10,22,0.04)',
        borderColor: isWhiteLabel ? 'rgba(21,128,61,0.2)' : 'rgba(10,10,22,0.12)',
      }}>
        <span style={{ fontSize: '0.8rem', fontFamily: 'system-ui', color: isWhiteLabel ? '#15803d' : 'rgba(10,10,22,0.5)' }}>
          {isWhiteLabel
            ? '✓ White label is active — your branding is showing on public pages.'
            : 'White label is not yet active. Configure your branding below, then contact support to enable it.'}
        </span>
      </div>

      <div style={s.cols}>

        {/* ── Left: form ── */}
        <div style={s.formCol}>

          {/* Brand name */}
          <div style={s.field}>
            <label style={s.label}>Brand name</label>
            <p style={s.hint}>Displayed in the header when no logo is set.</p>
            <input
              type="text"
              value={brandName}
              onChange={e => setBrandName(e.target.value)}
              placeholder={orgName}
              style={s.input}
              maxLength={120}
            />
          </div>

          {/* Logo */}
          <div style={s.field}>
            <label style={s.label}>Logo</label>
            <p style={s.hint}>PNG, JPEG, SVG, or WebP. Max 2 MB. Displayed at max 40px height.</p>

            {logoUrl && (
              <div style={s.logoPreviewWrap}>
                <img src={logoUrl} alt="Current logo" style={s.logoThumb} />
                <button
                  onClick={() => setLogoUrl(null)}
                  style={s.clearBtn}
                  type="button"
                >
                  Remove logo
                </button>
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleLogoUpload(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{ ...s.secondaryBtn, opacity: uploading ? 0.6 : 1 }}
              type="button"
            >
              {uploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
            </button>
          </div>

          {/* Primary colour */}
          <div style={s.field}>
            <label style={s.label}>Primary colour</label>
            <p style={s.hint}>Accent colour — used for links, borders, and highlights. Default: #cdba93</p>
            <div style={s.colorRow}>
              <input
                type="color"
                value={isHex(primaryColor) ? primaryColor : DEFAULTS.primaryColor}
                onChange={e => { setPrimaryColor(e.target.value); setPrimaryRaw(e.target.value); }}
                style={s.colorSwatch}
              />
              <input
                type="text"
                value={primaryRaw}
                onChange={e => handlePrimaryText(e.target.value)}
                placeholder="#cdba93"
                maxLength={7}
                style={{ ...s.input, width: '120px', fontFamily: 'monospace' }}
              />
              <button
                onClick={() => { setPrimaryColor(DEFAULTS.primaryColor); setPrimaryRaw(DEFAULTS.primaryColor); }}
                style={s.resetBtn}
                type="button"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Secondary colour */}
          <div style={s.field}>
            <label style={s.label}>Background colour</label>
            <p style={s.hint}>Page background on public QR pages. Default: #4f5d75</p>
            <div style={s.colorRow}>
              <input
                type="color"
                value={isHex(secondaryColor) ? secondaryColor : DEFAULTS.secondaryColor}
                onChange={e => { setSecondaryColor(e.target.value); setSecondaryRaw(e.target.value); }}
                style={s.colorSwatch}
              />
              <input
                type="text"
                value={secondaryRaw}
                onChange={e => handleSecondaryText(e.target.value)}
                placeholder="#4f5d75"
                maxLength={7}
                style={{ ...s.input, width: '120px', fontFamily: 'monospace' }}
              />
              <button
                onClick={() => { setSecondaryColor(DEFAULTS.secondaryColor); setSecondaryRaw(DEFAULTS.secondaryColor); }}
                style={s.resetBtn}
                type="button"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Support email */}
          <div style={s.field}>
            <label style={s.label}>Support email <span style={s.optional}>(optional)</span></label>
            <p style={s.hint}>Shown in the footer of public QR pages so families can contact you.</p>
            <input
              type="email"
              value={supportEmail}
              onChange={e => setSupportEmail(e.target.value)}
              placeholder="info@yourhome.com.au"
              style={s.input}
            />
          </div>

          {/* Powered by toggle */}
          <div style={s.field}>
            <label style={s.label}>Show "Powered by Absolute Posterity"</label>
            <p style={s.hint}>Only visible when white label is not active.</p>
            <div style={s.toggleRow}>
              <button
                role="switch"
                aria-checked={poweredByEnabled}
                onClick={() => setPoweredByEnabled(p => !p)}
                style={{
                  ...s.toggle,
                  background: poweredByEnabled ? '#4f5d75' : 'rgba(10,10,22,0.15)',
                }}
                type="button"
              >
                <span style={{
                  ...s.toggleKnob,
                  transform: poweredByEnabled ? 'translateX(20px)' : 'translateX(2px)',
                }} />
              </button>
              <span style={s.toggleLabel}>
                {poweredByEnabled ? 'Shown' : 'Hidden'}
              </span>
            </div>
          </div>

          {/* Feedback */}
          {error && <p style={s.err}>{error}</p>}
          {saved && <p style={s.ok}>Branding saved.</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}
            type="button"
          >
            {saving ? 'Saving…' : 'Save branding'}
          </button>

        </div>

        {/* ── Right: live preview ── */}
        <div style={s.previewCol}>
          <p style={s.previewHeading}>Live preview</p>
          <BrandPreview
            brandName={brandName || orgName}
            logoUrl={logoUrl}
            primaryColor={isHex(primaryColor) ? primaryColor : DEFAULTS.primaryColor}
            secondaryColor={isHex(secondaryColor) ? secondaryColor : DEFAULTS.secondaryColor}
            supportEmail={supportEmail}
            poweredByEnabled={poweredByEnabled}
          />
          <p style={s.previewCaption}>
            This is how your branding appears on public QR experience pages
            (e.g. /v/[token]) when white label is active.
          </p>
        </div>

      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  wrap: {
    fontFamily: 'system-ui, sans-serif',
  },
  loading: {
    color:      'rgba(10,10,22,0.4)',
    fontSize:   '0.875rem',
    fontFamily: 'system-ui, sans-serif',
  },
  notice: {
    borderRadius: '8px',
    border:       '1px solid',
    padding:      '0.75rem 1rem',
    marginBottom: '1.75rem',
  },
  cols: {
    display:   'flex',
    gap:       '2.5rem',
    alignItems: 'flex-start',
    flexWrap:  'wrap',
  },
  formCol: {
    flex:     '1 1 340px',
    minWidth: '280px',
  },
  previewCol: {
    flex:     '0 0 260px',
    minWidth: '220px',
  },
  field: {
    marginBottom: '1.4rem',
  },
  label: {
    display:       'block',
    fontSize:      '0.78rem',
    fontWeight:    600,
    color:         'rgba(10,10,22,0.55)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom:  '0.2rem',
  },
  hint: {
    margin:     '0 0 0.45rem',
    fontSize:   '0.76rem',
    color:      'rgba(10,10,22,0.38)',
    lineHeight: 1.5,
  },
  optional: {
    fontWeight:    400,
    textTransform: 'none',
    letterSpacing: 0,
    color:         'rgba(10,10,22,0.3)',
  },
  input: {
    width:        '100%',
    padding:      '0.5rem 0.7rem',
    border:       '1px solid rgba(10,10,22,0.18)',
    borderRadius: '6px',
    fontSize:     '0.9rem',
    color:        '#4f5d75',
    background:   '#fff',
    boxSizing:    'border-box',
    outline:      'none',
  },
  colorRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '0.6rem',
    flexWrap:   'wrap',
  },
  colorSwatch: {
    width:        '38px',
    height:       '38px',
    border:       '1px solid rgba(10,10,22,0.18)',
    borderRadius: '6px',
    cursor:       'pointer',
    padding:      '2px',
    background:   'none',
    flexShrink:   0,
  },
  resetBtn: {
    background:   'none',
    border:       '1px solid rgba(10,10,22,0.15)',
    borderRadius: '5px',
    padding:      '0.3rem 0.65rem',
    fontSize:     '0.75rem',
    color:        'rgba(10,10,22,0.5)',
    cursor:       'pointer',
    fontFamily:   'system-ui, sans-serif',
  },
  logoPreviewWrap: {
    display:      'flex',
    alignItems:   'center',
    gap:          '0.75rem',
    marginBottom: '0.6rem',
    padding:      '0.6rem',
    background:   '#4f5d75',
    borderRadius: '6px',
    width:        'fit-content',
  },
  logoThumb: {
    maxHeight:  32,
    maxWidth:   120,
    objectFit:  'contain',
    display:    'block',
  },
  clearBtn: {
    background:   'none',
    border:       'none',
    color:        '#b91c1c',
    fontSize:     '0.75rem',
    cursor:       'pointer',
    fontFamily:   'system-ui, sans-serif',
    padding:      0,
    textDecoration: 'underline',
  },
  secondaryBtn: {
    background:   '#f7f5f2',
    border:       '1px solid rgba(10,10,22,0.18)',
    borderRadius: '6px',
    padding:      '0.5rem 1rem',
    fontSize:     '0.85rem',
    fontFamily:   'system-ui, sans-serif',
    color:        '#4f5d75',
    cursor:       'pointer',
  },
  toggleRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '0.65rem',
  },
  toggle: {
    width:        '44px',
    height:       '24px',
    borderRadius: '999px',
    border:       'none',
    cursor:       'pointer',
    position:     'relative',
    transition:   'background 0.2s',
    flexShrink:   0,
    padding:      0,
  },
  toggleKnob: {
    position:   'absolute',
    top:        '3px',
    width:      '18px',
    height:     '18px',
    background: '#fff',
    borderRadius: '50%',
    transition: 'transform 0.2s',
    display:    'block',
  },
  toggleLabel: {
    fontSize:   '0.85rem',
    color:      'rgba(10,10,22,0.6)',
  },
  err: {
    color:      '#b91c1c',
    fontSize:   '0.82rem',
    margin:     '0 0 0.75rem',
  },
  ok: {
    color:      '#15803d',
    fontSize:   '0.82rem',
    margin:     '0 0 0.75rem',
  },
  saveBtn: {
    background:    '#4f5d75',
    color:         '#f0ece4',
    border:        'none',
    borderRadius:  '7px',
    padding:       '0.65rem 1.5rem',
    fontSize:      '0.9rem',
    fontWeight:    600,
    fontFamily:    'system-ui, sans-serif',
    cursor:        'pointer',
    letterSpacing: '0.02em',
  },
  previewHeading: {
    margin:        '0 0 0.6rem',
    fontSize:      '0.72rem',
    fontWeight:    600,
    color:         'rgba(10,10,22,0.4)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  previewCaption: {
    marginTop:  '0.6rem',
    fontSize:   '0.72rem',
    color:      'rgba(10,10,22,0.35)',
    lineHeight: 1.5,
  },
};

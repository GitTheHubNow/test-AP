'use client';

// components/products/ProductRequestForm.tsx
//
// Client component for creating product requests on the per-memorial page.
// Also handles deletion of REQUESTED items via fetch (progressive enhancement
// over the server-side placeholder in the page component).

import { useState, useTransition } from 'react';
import { useRouter }               from 'next/navigation';
import { VALID_PRODUCT_TYPES }     from '@/lib/products/transitions';

interface Props {
  memorialId: string;
}

const PRODUCT_LABELS: Record<string, string> = {
  plaque:   'Plaque',
  card:     'Card',
  print:    'Print',
  keepsake: 'Keepsake',
  other:    'Other',
};

export function ProductRequestForm({ memorialId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [productType, setProductType] = useState<string>('plaque');
  const [quantity,    setQuantity]    = useState<number>(1);
  const [notes,       setNotes]       = useState('');
  const [error,       setError]       = useState<string | null>(null);
  const [success,     setSuccess]     = useState(false);

  async function handleSubmit() {
    setError(null);
    setSuccess(false);

    const res = await fetch(`/api/memorials/${memorialId}/products`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productType,
        quantity,
        requestNotes: notes.trim() || undefined,
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      setError(json.error ?? 'Failed to create request');
      return;
    }

    setSuccess(true);
    setNotes('');
    setQuantity(1);
    startTransition(() => router.refresh());
  }

  return (
    <div>
      {/* Product type */}
      <div style={field}>
        <label style={label}>Product type</label>
        <select
          value={productType}
          onChange={e => setProductType(e.target.value)}
          style={select}
        >
          {VALID_PRODUCT_TYPES.map(t => (
            <option key={t} value={t}>{PRODUCT_LABELS[t] ?? t}</option>
          ))}
        </select>
      </div>

      {/* Quantity */}
      <div style={field}>
        <label style={label}>Quantity</label>
        <input
          type="number"
          min={1}
          max={999}
          value={quantity}
          onChange={e => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
          style={input}
        />
      </div>

      {/* Notes */}
      <div style={field}>
        <label style={label}>Notes <span style={optional}>(optional)</span></label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Size, material, text for engraving, photo to use…"
          style={textarea}
        />
      </div>

      {/* Feedback */}
      {error   && <p style={errMsg}>{error}</p>}
      {success && <p style={okMsg}>Request created.</p>}

      <button
        onClick={handleSubmit}
        disabled={pending}
        style={{ ...btn, opacity: pending ? 0.6 : 1 }}
      >
        {pending ? 'Creating…' : 'Create Request'}
      </button>
    </div>
  );
}

// ── Inline styles ─────────────────────────────────────────────────────────────

const field: React.CSSProperties = {
  marginBottom: '1rem',
};

const label: React.CSSProperties = {
  display:      'block',
  fontSize:     '0.8rem',
  fontWeight:   600,
  color:        'rgba(10,10,22,0.6)',
  fontFamily:   'system-ui, sans-serif',
  marginBottom: '0.35rem',
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
};

const optional: React.CSSProperties = {
  fontWeight:    400,
  textTransform: 'none',
  letterSpacing: 0,
  color:         'rgba(10,10,22,0.35)',
};

const inputBase: React.CSSProperties = {
  width:        '100%',
  padding:      '0.55rem 0.75rem',
  border:       '1px solid rgba(10,10,22,0.18)',
  borderRadius: '6px',
  fontSize:     '0.9rem',
  fontFamily:   'system-ui, sans-serif',
  color:        '#4f5d75',
  background:   '#fff',
  boxSizing:    'border-box',
  outline:      'none',
};

const select:   React.CSSProperties = { ...inputBase };
const input:    React.CSSProperties = { ...inputBase, width: '120px' };
const textarea: React.CSSProperties = { ...inputBase, resize: 'vertical', lineHeight: 1.5 };

const btn: React.CSSProperties = {
  background:    '#4f5d75',
  color:         '#f0ece4',
  border:        'none',
  borderRadius:  '7px',
  padding:       '0.65rem 1.4rem',
  fontSize:      '0.9rem',
  fontWeight:    600,
  fontFamily:    'system-ui, sans-serif',
  cursor:        'pointer',
  letterSpacing: '0.02em',
};

const errMsg: React.CSSProperties = {
  color:      '#b91c1c',
  fontSize:   '0.82rem',
  fontFamily: 'system-ui, sans-serif',
  margin:     '0 0 0.75rem',
};

const okMsg: React.CSSProperties = {
  color:      '#15803d',
  fontSize:   '0.82rem',
  fontFamily: 'system-ui, sans-serif',
  margin:     '0 0 0.75rem',
};

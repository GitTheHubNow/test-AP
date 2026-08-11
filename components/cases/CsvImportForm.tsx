'use client';

// components/cases/CsvImportForm.tsx
//
// Three-stage CSV import flow:
//   Stage 1 — DROP:    drag-and-drop or click to select CSV file
//   Stage 2 — PREVIEW: show first 5 rows with column mapping, detected headers,
//                       row count — user confirms before sending
//   Stage 3 — RESULT:  created / skipped / errors breakdown + link to cases list
//
// Uses browser's built-in FileReader — no external CSV library needed here.
// The server route does the full parse; the client just previews the raw rows
// so the funeral home can spot a wrong file before committing.

import { useState, useRef, useCallback } from 'react';
import { useRouter }                      from 'next/navigation';

// ── Types ─────────────────────────────────────────────────────────────────────

type Stage = 'drop' | 'preview' | 'uploading' | 'result';

interface PreviewData {
  headers:  string[];
  rows:     string[][];   // first 5 data rows
  totalRows:number;       // total data rows (excl. header)
  fileName: string;
  file:     File;
}

interface ImportResult {
  created:          number;
  skipped:          number;
  errors:           Array<{ row: number; error: string }>;
  totalRows:        number;
  memorialsCreated: number;
  memorialErrors:   Array<{ row: number; caseRef: string; error: string }>;
}

// ── Minimal CSV preview parser (header + first 5 rows only) ──────────────────

function previewCSV(text: string): { headers: string[]; rows: string[][]; total: number } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [], total: 0 };

  function splitLine(line: string): string[] {
    const cells: string[] = [];
    let cell = '';
    let inQ  = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (!inQ && ch === ',') { cells.push(cell.trim()); cell = ''; continue; }
      cell += ch;
    }
    cells.push(cell.trim());
    return cells;
  }

  const headers  = splitLine(lines[0]);
  const dataLines = lines.slice(1);
  const rows     = dataLines.slice(0, 5).map(splitLine);
  return { headers, rows, total: dataLines.length };
}

// ── Known field labels for preview ───────────────────────────────────────────

const KNOWN_FIELDS: Record<string, string> = {
  case_ref: 'Case Ref', reference: 'Case Ref', ref: 'Case Ref',
  deceased_name: 'Deceased', name: 'Deceased', full_name: 'Deceased',
  family_contact: 'Family Contact', contact: 'Family Contact',
  contact_email: 'Email', email: 'Email',
  contact_phone: 'Phone', phone: 'Phone', mobile: 'Phone',
  service_date: 'Service Date', date: 'Service Date', funeral_date: 'Service Date',
  venue: 'Venue', location: 'Venue',
  notes: 'Notes', comments: 'Notes',
};

function headerLabel(h: string): string {
  const norm = h.toLowerCase().replace(/\s+/g, '_');
  return KNOWN_FIELDS[norm]
    ? `${h} → ${KNOWN_FIELDS[norm]}`
    : h;
}

function hasRequired(headers: string[]): boolean {
  const norm = headers.map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const hasRef  = norm.some(h => ['case_ref','reference','ref','case_number','case_no'].includes(h));
  const hasName = norm.some(h => ['deceased_name','name','full_name','fullname','deceased'].includes(h));
  return hasRef && hasName;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CsvImportForm() {
  const router = useRouter();
  const [stage,   setStage]   = useState<Stage>('drop');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result,  setResult]  = useState<ImportResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [dragging,setDragging]= useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── File selected ───────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a .csv file.');
      return;
    }
    if (file.size > 500 * 1024) {
      setError('File must be under 500 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const { headers, rows, total } = previewCSV(text);
      if (headers.length === 0 || total === 0) {
        setError('CSV appears empty or has no data rows.');
        return;
      }
      setPreview({ headers, rows, totalRows: total, fileName: file.name, file });
      setStage('preview');
    };
    reader.readAsText(file);
  }, []);

  // ── Drag handlers ───────────────────────────────────────────────────────────

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  // ── Upload ──────────────────────────────────────────────────────────────────

  async function handleImport() {
    if (!preview) return;
    setStage('uploading');
    setError(null);
    try {
      const form = new FormData();
      form.append('file', preview.file);
      const res  = await fetch('/api/org/cases/csv-import', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Import failed');
        setStage('preview');
        return;
      }
      setResult(json.data);
      setStage('result');
    } catch (e: any) {
      setError(e.message ?? 'Network error');
      setStage('preview');
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  // Stage 1: Drop zone
  if (stage === 'drop') {
    return (
      <div>
        {error && <p style={s.err}>{error}</p>}

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            ...s.dropZone,
            background:  dragging ? 'rgba(201,169,110,0.06)' : '#fafaf9',
            borderColor: dragging ? '#c9a96e' : 'rgba(10,10,22,0.18)',
          }}
        >
          <div style={s.dropIcon}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
              stroke="rgba(10,10,22,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <p style={s.dropTitle}>Drop your CSV here</p>
          <p style={s.dropSub}>or click to browse</p>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
      </div>
    );
  }

  // Stage 2: Preview
  if ((stage === 'preview' || stage === 'uploading') && preview) {
    const required = hasRequired(preview.headers);
    return (
      <div>
        {error && <p style={s.err}>{error}</p>}

        <div style={s.previewHeader}>
          <div>
            <p style={s.fileName}>{preview.fileName}</p>
            <p style={s.rowCount}>{preview.totalRows} data rows detected</p>
          </div>
          <button onClick={() => { setStage('drop'); setPreview(null); setError(null); }} style={s.changeBtn}>
            Change file
          </button>
        </div>

        {!required && (
          <div style={s.warnBox}>
            <p style={s.warnText}>
              ⚠ Could not detect required columns <strong>case_ref</strong> and <strong>deceased_name</strong>.
              Check your column headers match the expected names.
            </p>
          </div>
        )}

        {/* Column mapping */}
        <div style={s.section}>
          <p style={s.sectionLabel}>Detected columns</p>
          <div style={s.colTags}>
            {preview.headers.map((h, i) => {
              const norm = h.toLowerCase().replace(/\s+/g, '_');
              const known = !!KNOWN_FIELDS[norm];
              return (
                <span key={i} style={{
                  ...s.colTag,
                  background:  known ? 'rgba(21,128,61,0.07)' : 'rgba(10,10,22,0.05)',
                  color:       known ? '#15803d' : 'rgba(10,10,22,0.45)',
                  border:      known ? '1px solid rgba(21,128,61,0.2)' : '1px solid rgba(10,10,22,0.1)',
                }}>
                  {headerLabel(h)}
                </span>
              );
            })}
          </div>
        </div>

        {/* Row preview table */}
        <div style={s.section}>
          <p style={s.sectionLabel}>First {Math.min(preview.rows.length, 5)} rows</p>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  {preview.headers.map((h, i) => (
                    <th key={i} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#fafaf9' }}>
                    {preview.headers.map((_, ci) => (
                      <td key={ci} style={s.td}>{row[ci] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.totalRows > 5 && (
            <p style={s.moreRows}>…and {preview.totalRows - 5} more rows</p>
          )}
        </div>

        <div style={s.actions}>
          <button
            onClick={handleImport}
            disabled={!required || stage === 'uploading'}
            style={{
              ...s.importBtn,
              opacity: (!required || stage === 'uploading') ? 0.5 : 1,
              cursor:  (!required || stage === 'uploading') ? 'not-allowed' : 'pointer',
            }}
          >
            {stage === 'uploading' ? 'Importing…' : `Import ${preview.totalRows} cases`}
          </button>
        </div>
      </div>
    );
  }

  // Stage 3: Result
  if (stage === 'result' && result) {
    return (
      <div>
        {/* Summary */}
        <div style={{ ...s.resultGrid, gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
          <div style={{ ...s.resultCard, borderColor: '#bbf7d0' }}>
            <span style={{ ...s.resultNum, color: '#15803d' }}>{result.created}</span>
            <span style={s.resultLabel}>Cases created</span>
          </div>
          <div style={{ ...s.resultCard, borderColor: '#bbf7d0' }}>
            <span style={{ ...s.resultNum, color: '#15803d' }}>{result.memorialsCreated}</span>
            <span style={s.resultLabel}>Memorials created</span>
          </div>
          <div style={{ ...s.resultCard, borderColor: '#bfdbfe' }}>
            <span style={{ ...s.resultNum, color: '#1d4ed8' }}>{result.skipped}</span>
            <span style={s.resultLabel}>Skipped (already exist)</span>
          </div>
          <div style={{ ...s.resultCard, borderColor: (result.errors.length + result.memorialErrors.length) ? '#fecaca' : '#bbf7d0' }}>
            <span style={{ ...s.resultNum, color: (result.errors.length + result.memorialErrors.length) ? '#b91c1c' : '#15803d' }}>
              {result.errors.length + result.memorialErrors.length}
            </span>
            <span style={s.resultLabel}>Errors</span>
          </div>
        </div>

        {/* Row errors */}
        {result.errors.length > 0 && (
          <div style={s.errList}>
            <p style={s.errListTitle}>Rows with errors (not imported):</p>
            {result.errors.map((e, i) => (
              <div key={i} style={s.errRow}>
                <span style={s.errRowNum}>Row {e.row}</span>
                <span style={s.errRowMsg}>{e.error}</span>
              </div>
            ))}
          </div>
        )}

        {/* Memorial auto-create errors — case was still created, just no memorial yet */}
        {result.memorialErrors.length > 0 && (
          <div style={s.errList}>
            <p style={s.errListTitle}>Cases imported, but memorial not auto-created:</p>
            {result.memorialErrors.map((e, i) => (
              <div key={i} style={s.errRow}>
                <span style={s.errRowNum}>{e.caseRef}</span>
                <span style={s.errRowMsg}>{e.error}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={s.actions}>
          <button
            onClick={() => router.push('/dashboard/cases')}
            style={s.importBtn}
          >
            View cases →
          </button>
          {result.errors.length > 0 && (
            <button
              onClick={() => { setStage('drop'); setPreview(null); setResult(null); setError(null); }}
              style={s.changeBtn}
            >
              Import another file
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  err: {
    background:   '#fef2f2',
    border:       '1px solid #fecaca',
    borderRadius: '6px',
    padding:      '0.6rem 0.9rem',
    color:        '#b91c1c',
    fontSize:     '0.82rem',
    fontFamily:   'system-ui, sans-serif',
    marginBottom: '1rem',
  },
  dropZone: {
    border:        '2px dashed',
    borderRadius:  '10px',
    padding:       '3rem 2rem',
    textAlign:     'center',
    cursor:        'pointer',
    transition:    'border-color 0.15s, background 0.15s',
    userSelect:    'none',
  },
  dropIcon:  { marginBottom: '0.75rem' },
  dropTitle: { margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 600, color: '#0a0a16', fontFamily: 'system-ui' },
  dropSub:   { margin: 0, fontSize: '0.82rem', color: 'rgba(10,10,22,0.4)', fontFamily: 'system-ui' },
  previewHeader: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   '1.25rem',
    gap:            '1rem',
  },
  fileName:   { margin: '0 0 0.15rem', fontSize: '0.92rem', fontWeight: 600, color: '#0a0a16', fontFamily: 'system-ui' },
  rowCount:   { margin: 0, fontSize: '0.78rem', color: 'rgba(10,10,22,0.4)', fontFamily: 'system-ui' },
  changeBtn: {
    background:   'none',
    border:       '1px solid rgba(10,10,22,0.18)',
    borderRadius: '6px',
    padding:      '0.35rem 0.75rem',
    fontSize:     '0.78rem',
    fontFamily:   'system-ui',
    color:        'rgba(10,10,22,0.55)',
    cursor:       'pointer',
    whiteSpace:   'nowrap',
  },
  warnBox: {
    background:   '#fffbeb',
    border:       '1px solid #fde68a',
    borderRadius: '6px',
    padding:      '0.65rem 0.9rem',
    marginBottom: '1.25rem',
  },
  warnText: { margin: 0, fontSize: '0.82rem', color: '#92400e', fontFamily: 'system-ui', lineHeight: 1.5 },
  section:      { marginBottom: '1.25rem' },
  sectionLabel: { margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 600, color: 'rgba(10,10,22,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'system-ui' },
  colTags:      { display: 'flex', flexWrap: 'wrap', gap: '0.4rem' },
  colTag:       { fontSize: '0.75rem', fontFamily: 'system-ui', borderRadius: '4px', padding: '0.2em 0.55em' },
  tableWrap:    { overflowX: 'auto', borderRadius: '6px', border: '1px solid rgba(10,10,22,0.1)' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: 'system-ui' },
  th:           { padding: '0.5rem 0.65rem', background: '#f7f5f2', color: 'rgba(10,10,22,0.55)', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(10,10,22,0.1)' },
  td:           { padding: '0.45rem 0.65rem', color: '#0a0a16', borderBottom: '1px solid rgba(10,10,22,0.05)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  moreRows:     { margin: '0.5rem 0 0', fontSize: '0.74rem', color: 'rgba(10,10,22,0.35)', fontFamily: 'system-ui' },
  actions:      { display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(10,10,22,0.07)' },
  importBtn: {
    background:    '#0a0a16',
    color:         '#f0ece4',
    border:        'none',
    borderRadius:  '7px',
    padding:       '0.65rem 1.4rem',
    fontSize:      '0.9rem',
    fontWeight:    600,
    fontFamily:    'system-ui',
    cursor:        'pointer',
    letterSpacing: '0.02em',
  },
  resultGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' },
  resultCard:  { background: '#fff', borderRadius: '8px', border: '1px solid', padding: '1rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  resultNum:   { fontSize: '2rem', fontWeight: 700, fontFamily: 'system-ui', lineHeight: 1 },
  resultLabel: { fontSize: '0.73rem', color: 'rgba(10,10,22,0.45)', fontFamily: 'system-ui' },
  errList:     { background: '#fef2f2', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' },
  errListTitle:{ margin: '0 0 0.65rem', fontSize: '0.8rem', fontWeight: 600, color: '#b91c1c', fontFamily: 'system-ui' },
  errRow:      { display: 'flex', gap: '0.75rem', padding: '0.25rem 0', borderBottom: '1px solid rgba(185,28,28,0.08)' },
  errRowNum:   { fontSize: '0.75rem', fontFamily: 'monospace', color: '#b91c1c', minWidth: '50px', flexShrink: 0 },
  errRowMsg:   { fontSize: '0.75rem', fontFamily: 'system-ui', color: '#7f1d1d' },
};

'use client';

// Staff bulk upload for a memorial's Collection.
//
// Flow: choose/drop many files → pre-check in the browser (type, size, and the
// memorial's remaining storage) → POST …/bulk/prepare → PUT each file straight
// to the bucket (3 at a time, with progress + retry) → POST …/bulk/complete,
// which re-verifies everything server-side and records the items.
// In local dev (no bucket) it falls back to the single-file route.

import { useCallback, useRef, useState } from 'react';
import {
  BULK_ACCEPT_ATTR, BULK_LIMITS, formatBytes, planBulkBatch, resolveMimeType, titleFromFileName,
} from '@/lib/bulk-upload';
import { putWithProgress } from '@/lib/direct-upload-client';

type Status = 'queued' | 'uploading' | 'uploaded' | 'done' | 'failed';

interface Row {
  id:       number;
  file:     File;
  status:   Status;
  progress: number;      // 0-100 while uploading
  error?:   string;
  key?:     string;
  url?:     string;
  mime?:    string;
}

interface Storage { usedBytes: number; limitBytes: number }

interface Props {
  memorialId:   string;
  storage:      Storage;
  onItemsAdded: (items: any[]) => void;
}

const CONCURRENCY = 3;
const COMPLETE_CHUNK = 50;

export function BulkUploadPanel({ memorialId, storage, onItemsAdded }: Props) {
  const [rows,    setRows]    = useState<Row[]>([]);
  const [used,    setUsed]    = useState(storage.usedBytes);
  const [running, setRunning] = useState(false);
  const [banner,  setBanner]  = useState<string | null>(null);
  const [drag,    setDrag]    = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const nextId    = useRef(1);
  const cancelled = useRef(false);
  const xhrs      = useRef(new Set<XMLHttpRequest>());

  const patch = useCallback((id: number, p: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }, []);

  const remaining = Math.max(0, storage.limitBytes - used);
  const pct = Math.min(100, Math.round((used / storage.limitBytes) * 100));
  const queued = rows.filter((r) => r.status === 'queued');
  const queuedBytes = queued.reduce((n, r) => n + r.file.size, 0);

  function addFiles(list: FileList | File[]) {
    setBanner(null);
    const incoming = Array.from(list);
    const room = BULK_LIMITS.maxFilesPerBatch - queued.length;
    if (room <= 0) { setBanner(`Up to ${BULK_LIMITS.maxFilesPerBatch} files per run — upload these first, then add more.`); return; }

    const take = incoming.slice(0, room);
    if (incoming.length > room) setBanner(`Only the first ${room} files were added (limit ${BULK_LIMITS.maxFilesPerBatch} per run).`);

    // Same rules as the server, applied against what's already queued.
    const plan = planBulkBatch(
      take.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      Math.max(0, remaining - queuedBytes),
    );
    const bad = new Map(plan.rejected.map((r) => [r.index, r.reason]));

    setRows((prev) => [
      ...prev,
      ...take.map((file, i): Row => ({
        id: nextId.current++, file,
        status: bad.has(i) ? 'failed' : 'queued', progress: 0,
        error: bad.get(i),
        mime: resolveMimeType(file.name, file.type),
      })),
    ]);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function start() {
    const batch = rows.filter((r) => r.status === 'queued');
    if (batch.length === 0) return;
    cancelled.current = false;
    setRunning(true);
    setBanner(null);

    try {
      const prep = await fetch(`/api/memorial/${memorialId}/collection/bulk/prepare`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: batch.map((r) => ({ name: r.file.name, type: r.mime ?? r.file.type, size: r.file.size })) }),
      });
      const pj = await prep.json();
      if (!prep.ok) throw new Error(pj.error ?? 'Could not start upload');
      const { mode, accepted, rejected } = pj.data as { mode: 'direct' | 'server'; accepted: any[]; rejected: any[] };

      for (const r of rejected) patch(batch[r.index].id, { status: 'failed', error: r.reason });

      // ── Upload ────────────────────────────────────────────────────────────
      const work = accepted.map((a) => ({ row: batch[a.index], a }));
      const added: any[] = [];
      const uploaded = new Set<number>(); // row ids whose bytes reached the bucket

      async function worker() {
        for (let w = work.shift(); w && !cancelled.current; w = work.shift()) {
          const { row, a } = w;
          patch(row.id, { status: 'uploading', progress: 0, key: a.key, url: a.uploadUrl });
          try {
            if (mode === 'server') {
              const fd = new FormData();
              fd.append('type', a.type); fd.append('title', titleFromFileName(row.file.name)); fd.append('file', row.file);
              const res = await fetch(`/api/memorial/${memorialId}/collection`, { method: 'POST', body: fd });
              const j = await res.json();
              if (!res.ok) throw new Error(j.error ?? 'Upload failed');
              added.push(j.data.item);
              patch(row.id, { status: 'done', progress: 100 });
            } else {
              let lastErr: unknown;
              for (let attempt = 0; attempt < 3 && !cancelled.current; attempt++) {
                try {
                  await putWithProgress(a.uploadUrl, row.file, a.mimeType, (p) => patch(row.id, { progress: p }), xhrs.current);
                  lastErr = undefined; break;
                } catch (e) {
                  lastErr = e;
                  if (cancelled.current) break;
                  await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
                }
              }
              if (lastErr) throw lastErr;
              uploaded.add(row.id);
              patch(row.id, { status: 'uploaded', progress: 100 });
            }
          } catch (e) {
            patch(row.id, { status: 'failed', error: e instanceof Error ? e.message : 'Upload failed' });
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      // ── Record what landed (even after Cancel, so nothing is orphaned) ────
      if (mode === 'direct') {
        const landed = accepted
          .map((a) => ({ row: batch[a.index], a }))
          .filter(({ row }) => uploaded.has(row.id));
        for (let i = 0; i < landed.length; i += COMPLETE_CHUNK) {
          const chunk = landed.slice(i, i + COMPLETE_CHUNK);
          const res = await fetch(`/api/memorial/${memorialId}/collection/bulk/complete`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: chunk.map(({ row, a }) => ({ key: a.key, name: row.file.name, size: row.file.size, mimeType: a.mimeType })) }),
          });
          const j = await res.json();
          if (!res.ok) { for (const { row } of chunk) patch(row.id, { status: 'failed', error: j.error ?? 'Could not save' }); continue; }
          const failedKeys = new Map<string, string>((j.data.failed as any[]).map((f) => [f.key, f.reason]));
          for (const { row, a } of chunk) {
            if (failedKeys.has(a.key)) patch(row.id, { status: 'failed', error: failedKeys.get(a.key) });
            else patch(row.id, { status: 'done' });
          }
          added.push(...j.data.items);
        }
      }

      if (added.length) {
        onItemsAdded(added);
        setUsed((u) => u + added.reduce((n, it) => n + (it.sizeBytes ?? 0), 0));
      }
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Upload failed');
      setRows((prev) => prev.map((r) => (r.status === 'uploading' ? { ...r, status: 'failed', error: 'Interrupted' } : r)));
    } finally {
      setRunning(false);
    }
  }

  function cancel() {
    cancelled.current = true;
    xhrs.current.forEach((x) => x.abort());
  }

  function retryFailed() {
    setRows((prev) => prev.map((r) => (r.status === 'failed' && !/Unsupported|Too large|storage limit/.test(r.error ?? '') ? { ...r, status: 'queued', progress: 0, error: undefined } : r)));
  }

  const done   = rows.filter((r) => r.status === 'done').length;
  const failed = rows.filter((r) => r.status === 'failed').length;

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.25rem' }}>
        Bulk upload
      </h3>
      <p style={{ fontSize: '0.78rem', color: 'var(--ash)', fontFamily: 'var(--font-body)', margin: '0 0 1rem' }}>
        Add many photos, videos and documents at once (up to {BULK_LIMITS.maxFilesPerBatch} per run). Everything lands as <b>Unsorted</b> for you to review.
      </p>

      {/* Storage meter */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ height: 8, borderRadius: 999, background: 'var(--ivory-mid)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: pct > 90 ? '#B91C1C' : 'var(--ink)', transition: 'width 0.3s' }} />
        </div>
        <p style={{ fontSize: '0.72rem', color: 'var(--ash)', fontFamily: 'var(--font-body)', margin: '0.35rem 0 0' }}>
          {formatBytes(used)} of {formatBytes(storage.limitBytes)} used · {formatBytes(remaining)} left
          {queued.length > 0 && <> · this run: {queued.length} file{queued.length !== 1 ? 's' : ''}, {formatBytes(queuedBytes)}</>}
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!running) addFiles(e.dataTransfer.files); }}
        onClick={() => !running && inputRef.current?.click()}
        style={{
          border: `2px dashed ${drag ? 'var(--ink)' : 'var(--ivory-mid)'}`, borderRadius: 10, padding: '1.5rem',
          textAlign: 'center', cursor: running ? 'default' : 'pointer', background: drag ? 'rgba(0,0,0,0.02)' : 'transparent',
          fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--ash)',
        }}
      >
        Drag files here, or <u>choose files</u>
        <input ref={inputRef} type="file" multiple accept={BULK_ACCEPT_ATTR} hidden
               onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </div>

      {banner && <p style={{ fontSize: '0.8rem', color: '#991B1B', fontFamily: 'var(--font-body)', marginTop: '0.75rem' }}>{banner}</p>}

      {rows.length > 0 && (
        <>
          <ul style={{ listStyle: 'none', margin: '1rem 0 0', padding: 0, maxHeight: 260, overflowY: 'auto', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>
            {rows.map((r) => (
              <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.3rem 0', borderBottom: '1px solid var(--ivory-mid)' }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>
                  {r.file.name} <span style={{ color: 'var(--ash)' }}>· {formatBytes(r.file.size)}</span>
                </span>
                <span style={{ width: 150, textAlign: 'right', color: r.status === 'failed' ? '#991B1B' : r.status === 'done' ? '#065F46' : 'var(--ash)' }}>
                  {r.status === 'uploading' && `Uploading ${r.progress}%`}
                  {r.status === 'queued' && 'Ready'}
                  {r.status === 'uploaded' && 'Saving…'}
                  {r.status === 'done' && 'Added ✓'}
                  {r.status === 'failed' && (r.error ?? 'Failed')}
                </span>
              </li>
            ))}
          </ul>

          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" disabled={running || queued.length === 0} onClick={start}>
              {running ? 'Uploading…' : `Upload ${queued.length} file${queued.length !== 1 ? 's' : ''}`}
            </button>
            {running && <button onClick={cancel} style={{ fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>}
            {!running && failed > 0 && <button onClick={retryFailed} style={{ fontSize: '0.8rem', cursor: 'pointer' }}>Retry failed</button>}
            {!running && <button onClick={() => setRows((p) => p.filter((r) => r.status !== 'done'))} style={{ fontSize: '0.8rem', cursor: 'pointer' }}>Clear finished</button>}
            <span style={{ fontSize: '0.75rem', color: 'var(--ash)', fontFamily: 'var(--font-body)' }}>
              {done} added{failed ? ` · ${failed} problem${failed !== 1 ? 's' : ''}` : ''}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

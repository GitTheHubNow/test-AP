// lib/direct-upload-client.ts  (BROWSER)
//
// Client half of lib/direct-upload.ts. PUTs a file straight to a presigned
// bucket URL (with progress) and wraps the prepare → PUT → complete dance for
// the single-file cases. Multi-file UIs (bulk panel, family link) use
// putWithProgress directly.

export function putWithProgress(
  url: string,
  file: Blob,
  mime: string,
  onProgress?: (pct: number) => void,
  track?: Set<XMLHttpRequest>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    track?.add(xhr);
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', mime);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload  = () => { track?.delete(xhr); xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)); };
    xhr.onerror = () => { track?.delete(xhr); reject(new Error('Network error')); };
    xhr.onabort = () => { track?.delete(xhr); reject(new Error('Cancelled')); };
    xhr.send(file);
  });
}

/** PUT with up to `attempts` tries and exponential backoff. */
export async function putWithRetry(
  url: string, file: Blob, mime: string,
  onProgress?: (pct: number) => void, track?: Set<XMLHttpRequest>, attempts = 3,
): Promise<void> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try { await putWithProgress(url, file, mime, onProgress, track); return; }
    catch (e) {
      last = e;
      if (e instanceof Error && e.message === 'Cancelled') throw e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i));
    }
  }
  throw last instanceof Error ? last : new Error('Upload failed');
}

/**
 * Upload ONE file through a prepare/complete route pair.
 * `fallback` is called when the server says mode:'server' (local dev, no
 * bucket) and should perform the old multipart upload, returning its Response.
 */
export async function directUploadOne(opts: {
  prepareUrl:  string;
  completeUrl: string;
  file:        Blob;
  name:        string;
  mime:        string;
  completeExtra?: Record<string, unknown>;       // merged into the item (title, description…)
  completeTopLevel?: Record<string, unknown>;    // merged into the body (uploaderName…)
  onProgress?: (pct: number) => void;
  fallback:    () => Promise<Response>;
}): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  const prep = await fetch(opts.prepareUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: [{ name: opts.name, type: opts.mime, size: opts.file.size }], name: opts.name, type: opts.mime, size: opts.file.size }),
  });
  const pj = await prep.json().catch(() => ({}));
  if (!prep.ok) return { ok: false, error: pj.error ?? 'Could not start upload' };

  const { mode, accepted, rejected } = pj.data ?? {};
  if (!accepted?.length) return { ok: false, error: rejected?.[0]?.reason ?? 'File not accepted' };

  if (mode === 'server') {
    const res = await opts.fallback();
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: j } : { ok: false, error: j.error ?? 'Upload failed' };
  }

  const a = accepted[0];
  try {
    await putWithRetry(a.uploadUrl, opts.file, a.mimeType, opts.onProgress);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Upload failed' };
  }

  const done = await fetch(opts.completeUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(opts.completeTopLevel ?? {}),
      key: a.key, mimeType: a.mimeType,
      items: [{ key: a.key, name: opts.name, size: opts.file.size, mimeType: a.mimeType, ...(opts.completeExtra ?? {}) }],
    }),
  });
  const dj = await done.json().catch(() => ({}));
  if (!done.ok) return { ok: false, error: dj.error ?? 'Could not save upload' };
  const failedOne = dj.data?.failed?.[0];
  if (failedOne) return { ok: false, error: failedOne.reason };
  return { ok: true, data: dj };
}

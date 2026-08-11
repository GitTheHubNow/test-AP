'use client';

import { useState, useRef } from 'react';

interface Props {
  token:      string;
  memorialId: string;
}

interface UploadedFile {
  file:    File;
  preview: string;
}

const MAX_FILES    = 30;
const MAX_MB       = 50;
const ACCEPTED     = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const ACCEPTED_EXT = '.jpg,.jpeg,.png,.webp,.heic,.heif';

export function PublicUploadForm({ token, memorialId }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploaderName,  setUploaderName]  = useState('');
  const [uploaderEmail, setUploaderEmail] = useState('');
  const [files,         setFiles]         = useState<UploadedFile[]>([]);
  const [uploading,     setUploading]     = useState(false);
  const [progress,      setProgress]      = useState(0);
  const [successCount,  setSuccessCount]  = useState(0);
  const [error,         setError]         = useState<string | null>(null);
  const [done,          setDone]          = useState(false);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    setError(null);

    const valid: UploadedFile[] = [];
    for (const f of selected) {
      if (!ACCEPTED.includes(f.type) && !f.name.toLowerCase().match(/\.(heic|heif)$/)) {
        setError(`"${f.name}" is not a supported image type.`);
        return;
      }
      if (f.size > MAX_MB * 1024 * 1024) {
        setError(`"${f.name}" is too large. Maximum size is ${MAX_MB}MB.`);
        return;
      }
      valid.push({ file: f, preview: URL.createObjectURL(f) });
    }

    const combined = [...files, ...valid].slice(0, MAX_FILES);
    setFiles(combined);

    // Reset input so same files can be re-added after removal
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(idx: number) {
    setFiles(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function handleSubmit() {
    if (files.length === 0) { setError('Please select at least one photo.'); return; }
    setUploading(true);
    setError(null);
    setProgress(0);

    let uploaded = 0;
    const errors: string[] = [];

    for (const { file } of files) {
      const fd = new FormData();
      fd.append('file',         file);
      fd.append('uploaderName', uploaderName.trim());
      if (uploaderEmail.trim()) fd.append('uploaderEmail', uploaderEmail.trim());

      try {
        const res = await fetch(`/api/upload/${token}`, { method: 'POST', body: fd });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          errors.push(d.error ?? `Failed to upload "${file.name}"`);
        } else {
          uploaded++;
        }
      } catch {
        errors.push(`Network error uploading "${file.name}"`);
      }

      setProgress(Math.round(((uploaded + errors.length) / files.length) * 100));
    }

    setUploading(false);
    setSuccessCount(uploaded);

    if (errors.length > 0) {
      setError(`${uploaded} uploaded successfully. ${errors.length} failed: ${errors[0]}`);
    } else {
      setDone(true);
      setFiles([]);
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
        <p style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📸</p>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '1.5rem', fontWeight: 400, color: '#1a1714', marginBottom: '0.5rem' }}>
          Thank you
        </h2>
        <p style={{ fontFamily: 'Georgia, serif', fontSize: '0.9rem', color: '#8a8a9a', lineHeight: 1.7, marginBottom: '1.5rem' }}>
          {successCount} photo{successCount !== 1 ? 's' : ''} uploaded successfully.
          They'll appear on the memorial after review.
        </p>
        <button
          onClick={() => { setDone(false); setSuccessCount(0); }}
          style={{ fontSize: '0.85rem', padding: '0.55rem 1.25rem', borderRadius: 8, border: '1px solid #c9a96e', background: 'transparent', color: '#c9a96e', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
          Upload more photos
        </button>
      </div>
    );
  }

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.875rem',
    border: '1px solid #d1ccc5', borderRadius: 8, fontSize: '0.9rem',
    fontFamily: 'Georgia, serif', color: '#1a1714', background: '#fff',
    outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Name + email */}
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#5a534e', marginBottom: '0.4rem', fontFamily: 'Georgia, serif' }}>
          Your name <span style={{ fontWeight: 400, color: '#b0a898' }}>(optional)</span>
        </label>
        <input style={inp} type="text" value={uploaderName} maxLength={100}
          onChange={e => setUploaderName(e.target.value)}
          placeholder="e.g. Sarah Johnson" disabled={uploading} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#5a534e', marginBottom: '0.4rem', fontFamily: 'Georgia, serif' }}>
          Email address <span style={{ fontWeight: 400, color: '#b0a898' }}>(optional)</span>
        </label>
        <input style={inp} type="email" value={uploaderEmail} maxLength={200}
          onChange={e => setUploaderEmail(e.target.value)}
          placeholder="your@email.com" disabled={uploading} />
        <p style={{ marginTop: '0.25rem', fontSize: '0.72rem', color: '#b0a898', fontFamily: 'Georgia, serif' }}>
          So the family can thank you personally.
        </p>
      </div>

      {/* Drop zone */}
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#5a534e', marginBottom: '0.4rem', fontFamily: 'Georgia, serif' }}>
          Photos <span style={{ color: '#b0a898', fontWeight: 400 }}>(up to {MAX_FILES} at once)</span>
        </label>
        <div
          onClick={() => !uploading && fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${files.length > 0 ? '#c9a96e' : '#d1ccc5'}`, borderRadius: 10,
            padding: '2rem 1rem', textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer',
            background: files.length > 0 ? '#fffdf7' : '#fdfcfb', transition: 'all 0.15s',
          }}>
          <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }}>📷</p>
          <p style={{ fontFamily: 'Georgia, serif', fontSize: '0.9rem', color: '#5a534e', marginBottom: '0.25rem' }}>
            {files.length > 0 ? `${files.length} photo${files.length !== 1 ? 's' : ''} selected` : 'Tap to choose photos'}
          </p>
          <p style={{ fontFamily: 'Georgia, serif', fontSize: '0.75rem', color: '#b0a898' }}>
            JPG, PNG, WEBP, HEIC · up to {MAX_MB}MB each
          </p>
        </div>
        <input ref={fileInputRef} type="file" accept={ACCEPTED_EXT} multiple
          onChange={handleFileSelect} style={{ display: 'none' }} disabled={uploading} />
      </div>

      {/* Thumbnails */}
      {files.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {files.map((f, i) => (
            <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: '#f3f0ea' }}>
              <img src={f.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {!uploading && (
                <button onClick={() => removeFile(i)}
                  style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: '0.65rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ✕
                </button>
              )}
            </div>
          ))}
          {files.length < MAX_FILES && !uploading && (
            <div onClick={() => fileInputRef.current?.click()}
              style={{ aspectRatio: '1', borderRadius: 8, border: '2px dashed #d1ccc5', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#b0a898', fontSize: '1.5rem' }}>
              +
            </div>
          )}
        </div>
      )}

      {/* Progress */}
      {uploading && (
        <div>
          <div style={{ height: 6, background: '#ede8e0', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: '#c9a96e', borderRadius: 999, transition: 'width 0.3s' }} />
          </div>
          <p style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#8a8a9a', fontFamily: 'Georgia, serif', textAlign: 'center' }}>
            Uploading… {progress}%
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.75rem 1rem' }}>
          <p style={{ fontSize: '0.82rem', color: '#991b1b', fontFamily: 'Georgia, serif', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={uploading || files.length === 0}
        style={{
          width: '100%', padding: '0.9rem', borderRadius: 10, border: 'none',
          background: uploading || files.length === 0 ? '#c9c2b8' : '#1a1a2e',
          color: '#f5f0e8', fontSize: '0.95rem', fontWeight: 600,
          fontFamily: 'Georgia, serif', cursor: uploading || files.length === 0 ? 'not-allowed' : 'pointer',
          transition: 'background 0.15s',
        }}>
        {uploading ? `Uploading ${progress}%…` : `Upload ${files.length > 0 ? `${files.length} photo${files.length !== 1 ? 's' : ''}` : 'Photos'}`}
      </button>
    </div>
  );
}

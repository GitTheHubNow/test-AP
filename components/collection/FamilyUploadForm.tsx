'use client';

import { useState, useRef } from 'react';

interface Props {
  token: string;
}

const TYPE_OPTIONS = [
  { value: 'PHOTO',    label: '🖼️  Photo',    accept: 'image/jpeg,image/png,image/webp,image/heic' },
  { value: 'VIDEO',    label: '🎥  Video',    accept: 'video/mp4,video/quicktime' },
  { value: 'STORY',    label: '✍️  Story',    accept: '' },
  { value: 'DOCUMENT', label: '📄  Document', accept: 'application/pdf' },
];

function fmtBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FamilyUploadForm({ token }: Props) {
  const [type,        setType]        = useState('PHOTO');
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [file,        setFile]        = useState<File | null>(null);
  const [uploading,   setUploading]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [successes,   setSuccesses]   = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const currentType = TYPE_OPTIONS.find(t => t.value === type)!;

  async function handleSubmit() {
    if (type !== 'STORY' && !file) { setError('Please select a file.'); return; }
    if (type === 'STORY' && !description && !title) { setError('Please write a title or your story.'); return; }

    setError(null);
    setUploading(true);

    const fd = new FormData();
    fd.append('type', type);
    if (title)       fd.append('title',       title);
    if (description) fd.append('description', description);
    if (file)        fd.append('file',        file);

    try {
      const res  = await fetch(`/api/collect/${token}`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');

      const label = title || (type === 'STORY' ? 'Your story' : file?.name ?? 'Your upload');
      setSuccesses(prev => [...prev, label]);
      setTitle(''); setDescription(''); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '0.65rem 0.9rem',
    fontFamily: 'Georgia, serif', fontSize: '0.9rem',
    border: '1px solid #e5e0d8', borderRadius: 8,
    background: '#fff', color: '#1a1714', outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.72rem', fontWeight: 600,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    color: '#98a2b3', marginBottom: '0.35rem',
    fontFamily: 'Georgia, serif',
  };

  return (
    <div>
      {/* Uploaded items */}
      {successes.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          {successes.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '0.65rem',
              padding: '0.65rem 1rem', background: '#D1FAE5',
              borderRadius: 8, marginBottom: '0.5rem',
              fontSize: '0.85rem', color: '#065F46', fontFamily: 'Georgia, serif',
            }}>
              <span>✓</span>
              <span><strong>{s}</strong> uploaded successfully — it will appear after review.</span>
            </div>
          ))}
        </div>
      )}

      {/* Form card */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #ede8e0', padding: '1.75rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#1a1714', marginBottom: '1.25rem' }}>
          Share a Memory
        </h2>

        {/* Type selector */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '1.25rem' }}>
          {TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setType(opt.value); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
              style={{
                padding: '0.65rem', borderRadius: 8, fontSize: '0.85rem',
                fontFamily: 'Georgia, serif', cursor: 'pointer',
                border: `1.5px solid ${type === opt.value ? '#1a1714' : '#ede8e0'}`,
                background: type === opt.value ? '#1a1714' : '#faf8f5',
                color:      type === opt.value ? '#f4f1ea' : '#98a2b3',
                transition: 'all 0.1s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Title (optional)</label>
            <input
              style={inputStyle}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={type === 'STORY' ? 'e.g. The time we went camping' : 'e.g. Christmas 1988'}
            />
          </div>

          <div>
            <label style={labelStyle}>{type === 'STORY' ? 'Your story *' : 'Caption (optional)'}</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical' }}
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={type === 'STORY' ? 6 : 3}
              placeholder={type === 'STORY' ? 'Share a memory, a story, or a few words...' : 'Add a caption...'}
            />
          </div>

          {type !== 'STORY' && (
            <div>
              <label style={labelStyle}>File *</label>
              <input
                ref={fileRef}
                type="file"
                accept={currentType.accept}
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                style={{ ...inputStyle, padding: '0.45rem 0.9rem' }}
              />
              {file && (
                <p style={{ fontSize: '0.75rem', color: '#98a2b3', marginTop: '0.3rem', fontFamily: 'Georgia, serif' }}>
                  {file.name} — {fmtBytes(file.size)}
                </p>
              )}
            </div>
          )}

          {error && (
            <p style={{ fontSize: '0.82rem', color: '#991B1B', fontFamily: 'Georgia, serif', background: '#FEE2E2', padding: '0.65rem 0.9rem', borderRadius: 8 }}>
              {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={uploading}
            style={{
              padding: '0.85rem', borderRadius: 8, fontSize: '0.9rem', fontWeight: 600,
              fontFamily: 'Georgia, serif', cursor: uploading ? 'not-allowed' : 'pointer',
              background: uploading ? '#c4bdb5' : '#1a1714', color: '#f4f1ea',
              border: 'none', transition: 'background 0.15s',
            }}
          >
            {uploading ? 'Uploading…' : 'Submit Memory'}
          </button>

          <p style={{ fontSize: '0.72rem', color: '#c4bdb5', textAlign: 'center', fontFamily: 'Georgia, serif', lineHeight: 1.6 }}>
            Your submission will be reviewed before it appears on the memorial.
          </p>
        </div>
      </div>
    </div>
  );
}

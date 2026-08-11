'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';

// ── Types ──────────────────────────────────────────────────────────────────

interface Photo {
  id:              string;
  url:             string | null;
  caption:         string | null;
  tributeOrder:    number | null;
  tributeDuration: number | null;
  uploaderName:    string | null;
}

interface Track {
  id:              string;
  title:           string;
  artist:          string | null;
  category:        string;
  durationSeconds: number;
  previewUrl:      string | null;
}

interface TimelinePhoto extends Photo {
  duration: number; // seconds this photo shows (override or auto)
}

interface Memorial {
  id:          string;
  displayName: string;
  birthDate:   string | null;
  deathDate:   string | null;
  existingVideo: {
    id:             string;
    status:         string;
    theme:          string;
    musicTrackId:   string | null;
    photoOrder:     any[];
    titleCardText:  string | null;
    endCardText:    string | null;
    showOnMemorial: boolean;
    webBlobKey:     string | null;
  } | null;
}

type Theme = 'CLASSIC' | 'MODERN' | 'RUSTIC' | 'CELEBRATION';
type RenderState = 'idle' | 'loading_ffmpeg' | 'rendering' | 'done' | 'error';

// ── Theme definitions ──────────────────────────────────────────────────────

const THEMES: { key: Theme; label: string; description: string; bg: string; accent: string; font: string }[] = [
  { key: 'CLASSIC',     label: 'Classic Elegance',      description: 'Black, ivory & gold — traditional services',       bg: '#0a0806', accent: '#c9a96e', font: 'Georgia, serif' },
  { key: 'MODERN',      label: 'Modern Minimal',         description: 'White, charcoal & slate — contemporary',           bg: '#f8f8f8', accent: '#2d3748', font: 'system-ui, sans-serif' },
  { key: 'RUSTIC',      label: 'Warm & Rustic',          description: 'Cream, terracotta & sage — celebration of life',   bg: '#faf6f0', accent: '#9b4523', font: 'Georgia, serif' },
  { key: 'CELEBRATION', label: 'Bright Celebration',     description: 'Sky, coral & sunshine — joyful farewell',          bg: '#f0f9ff', accent: '#e85d04', font: 'system-ui, sans-serif' },
];

const MUSIC_CATEGORIES = ['PEACEFUL', 'UPLIFTING', 'CLASSICAL', 'HYMN', 'INSTRUMENTAL', 'CELEBRATION'];

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Drag-to-reorder timeline ───────────────────────────────────────────────

function Timeline({
  items, onReorder, onRemove, onDurationChange, autoDuration,
}: {
  items:            TimelinePhoto[];
  onReorder:        (from: number, to: number) => void;
  onRemove:         (id: string) => void;
  onDurationChange: (id: string, secs: number | null) => void;
  autoDuration:     number;
}) {
  const dragIdx = useRef<number | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', border: '2px dashed #2a2a3e', borderRadius: 8, color: '#5a5870' }}>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>Select photos from the left panel</p>
        </div>
      )}
      {items.map((item, i) => (
        <div
          key={item.id}
          draggable
          onDragStart={() => { dragIdx.current = i; }}
          onDragOver={e => e.preventDefault()}
          onDrop={() => {
            if (dragIdx.current !== null && dragIdx.current !== i) {
              onReorder(dragIdx.current, i);
            }
            dragIdx.current = null;
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: '#16152a', borderRadius: 8, padding: '0.5rem 0.75rem',
            border: '1px solid #2a2a3e', cursor: 'grab', userSelect: 'none',
          }}>
          {/* Drag handle */}
          <span style={{ color: '#3a3a5e', fontSize: '0.85rem', cursor: 'grab' }}>⠿</span>

          {/* Thumbnail */}
          <div style={{ width: 40, height: 40, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: '#0a0a1a' }}>
            {item.url && <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>

          {/* Index */}
          <span style={{ fontSize: '0.68rem', color: '#5a5870', minWidth: 18, textAlign: 'center' }}>{i + 1}</span>

          {/* Caption */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#c9c2e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.caption ?? item.uploaderName ?? `Photo ${i + 1}`}
            </p>
          </div>

          {/* Duration override */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="number" min={1} max={30} step={0.5}
              placeholder={autoDuration.toFixed(1)}
              defaultValue={item.tributeDuration ?? ''}
              onChange={e => {
                const v = parseFloat(e.target.value);
                onDurationChange(item.id, isNaN(v) ? null : Math.max(1, Math.min(30, v)));
              }}
              style={{
                width: 52, padding: '0.25rem 0.4rem', background: '#0a0a1a',
                border: '1px solid #2a2a3e', borderRadius: 4,
                color: '#c9c2e8', fontSize: '0.72rem', textAlign: 'center',
              }}
            />
            <span style={{ fontSize: '0.6rem', color: '#5a5870' }}>s</span>
          </div>

          {/* Remove */}
          <button onClick={() => onRemove(item.id)}
            style={{ background: 'none', border: 'none', color: '#5a5870', cursor: 'pointer', fontSize: '0.85rem', padding: '0.1rem 0.25rem', lineHeight: 1 }}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Music picker ───────────────────────────────────────────────────────────

function MusicPicker({ tracks, selectedId, onSelect }: {
  tracks:     Track[];
  selectedId: string | null;
  onSelect:   (id: string | null) => void;
}) {
  const [playing,  setPlaying]  = useState<string | null>(null);
  const [category, setCategory] = useState<string>('ALL');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function togglePreview(track: Track) {
    if (!track.previewUrl) return;
     console.log('previewUrl:', track.previewUrl)
    if (playing === track.id) {
      audioRef.current?.pause();
      setPlaying(null);
    } else {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
     const a = new Audio(track.previewUrl);a.play();
      a.onended = () => setPlaying(null);
      audioRef.current = a;
      setPlaying(track.id);
    }
  }

  const filtered = category === 'ALL' ? tracks : tracks.filter(t => t.category === category);

  return (
    <div>
      {/* Category filter */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {['ALL', ...MUSIC_CATEGORIES].map(cat => (
          <button key={cat} onClick={() => setCategory(cat)}
            style={{ fontSize: '0.65rem', padding: '0.25rem 0.6rem', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 500,
              background: category === cat ? '#c9a96e' : '#1a1a2e',
              color:      category === cat ? '#0a0a1a' : '#8a8aaa' }}>
            {cat}
          </button>
        ))}
      </div>

      {tracks.length === 0 && (
        <p style={{ fontSize: '0.78rem', color: '#5a5870', fontStyle: 'italic', padding: '1rem 0' }}>
          No music tracks in library yet. Add tracks via the admin panel or upload a custom track below.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
        {/* No music option */}
        <div onClick={() => onSelect(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.5rem 0.75rem', borderRadius: 6, cursor: 'pointer',
            background: selectedId === null ? 'rgba(201,169,110,0.12)' : 'transparent',
            border: `1px solid ${selectedId === null ? '#c9a96e' : '#2a2a3e'}` }}>
          <span style={{ fontSize: '0.72rem', color: selectedId === null ? '#c9a96e' : '#5a5870' }}>No music (silent)</span>
        </div>

        {filtered.map(track => (
          <div key={track.id} onClick={() => onSelect(track.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.5rem 0.75rem', borderRadius: 6, cursor: 'pointer',
              background: selectedId === track.id ? 'rgba(201,169,110,0.12)' : 'transparent',
              border: `1px solid ${selectedId === track.id ? '#c9a96e' : '#2a2a3e'}` }}>

            {/* Play preview */}
            {track.previewUrl && (
              <button onClick={e => { e.stopPropagation(); togglePreview(track); }}
                style={{ width: 24, height: 24, borderRadius: '50%', border: `1px solid #c9a96e`, background: 'transparent', color: '#c9a96e', cursor: 'pointer', fontSize: '0.6rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {playing === track.id ? '■' : '▶'}
              </button>
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: '0.78rem', color: selectedId === track.id ? '#c9a96e' : '#c9c2e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {track.title}
              </p>
              {track.artist && (
                <p style={{ margin: 0, fontSize: '0.65rem', color: '#5a5870' }}>{track.artist}</p>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '0.6rem', color: '#3a3a5e', background: '#1a1a2e', padding: '0.1rem 0.4rem', borderRadius: 3 }}>
                {track.category}
              </span>
              <span style={{ fontSize: '0.65rem', color: '#5a5870' }}>
                {formatDuration(track.durationSeconds)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Render progress bar ────────────────────────────────────────────────────

function RenderProgress({ progress, stage }: { progress: number; stage: string }) {
  return (
    <div style={{ padding: '1.5rem', background: '#0a0a1a', borderRadius: 10, border: '1px solid #2a2a3e' }}>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', color: '#c9a96e' }}>{stage}</p>
      <div style={{ height: 6, background: '#1a1a2e', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #c9a96e, #e8c87e)', borderRadius: 999, transition: 'width 0.3s' }} />
      </div>
      <p style={{ margin: '0.5rem 0 0', fontSize: '0.68rem', color: '#5a5870', textAlign: 'right' }}>{Math.round(progress)}%</p>
    </div>
  );
}

// ── Canvas preview ─────────────────────────────────────────────────────────

function CanvasPreview({ photos, theme, titleText, endText, currentIdx }: {
  photos:     TimelinePhoto[];
  theme:      Theme;
  titleText:  string;
  endText:    string;
  currentIdx: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const t         = THEMES.find(t => t.key === theme)!;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (currentIdx === -1) {
      // Title card
      ctx.fillStyle = t.accent;
      ctx.font = `bold 32px ${t.font}`;
      ctx.textAlign = 'center';
      ctx.fillText(titleText || 'Title Card', canvas.width / 2, canvas.height / 2);
    } else if (currentIdx === photos.length) {
      // End card
      ctx.fillStyle = t.accent;
      ctx.font = `24px ${t.font}`;
      ctx.textAlign = 'center';
      ctx.fillText(endText || 'In Loving Memory', canvas.width / 2, canvas.height / 2);
    } else if (photos[currentIdx]?.url) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Ken Burns: slight zoom from centre
        const scale  = 1.05;
        const sw     = canvas.width * scale;
        const sh     = canvas.height * scale;
        const sx     = (canvas.width - sw) / 2;
        const sy     = (canvas.height - sh) / 2;
        // Fit image
        const ratio  = Math.max(canvas.width / img.width, canvas.height / img.height);
        const dw     = img.width * ratio;
        const dh     = img.height * ratio;
        const dx     = (canvas.width - dw) / 2;
        const dy     = (canvas.height - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
        // Caption overlay
        if (photos[currentIdx].caption) {
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(0, canvas.height - 50, canvas.width, 50);
          ctx.fillStyle = '#fff';
          ctx.font = `italic 16px Georgia, serif`;
          ctx.textAlign = 'center';
          ctx.fillText(photos[currentIdx].caption!, canvas.width / 2, canvas.height - 18);
        }
      };
      img.src = photos[currentIdx].url!;
    }
  }, [currentIdx, photos, theme, titleText, endText]);

  return (
    <canvas ref={canvasRef} width={640} height={360}
      style={{ width: '100%', borderRadius: 8, border: '1px solid #2a2a3e', background: t.bg }} />
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function TributeVideoCreator({ memorial, photos: allPhotos, tracks }: {
  memorial:  Memorial;
  photos:    Photo[];
  tracks:    Track[];
}) {
  const existing = memorial.existingVideo;

  // ── State ────────────────────────────────────────────────────────────────

  const [timeline,     setTimeline]     = useState<TimelinePhoto[]>(() => {
    // Restore from saved photoOrder if exists
    if (existing?.photoOrder?.length) {
      const orderMap = new Map(existing.photoOrder.map((o: any) => [o.id, o]));
      return allPhotos
        .filter(p => orderMap.has(p.id))
        .sort((a, b) => {
          const oa = orderMap.get(a.id)?.order ?? 0;
          const ob = orderMap.get(b.id)?.order ?? 0;
          return oa - ob;
        })
        .map(p => ({ ...p, duration: orderMap.get(p.id)?.duration ?? p.tributeDuration ?? 5 }));
    }
    return allPhotos.map(p => ({ ...p, duration: p.tributeDuration ?? 5 }));
  });

  const [theme,        setTheme]        = useState<Theme>((existing?.theme as Theme) ?? 'CLASSIC');
  const [musicId,      setMusicId]      = useState<string | null>(existing?.musicTrackId ?? null);
  const [titleText,    setTitleText]    = useState(existing?.titleCardText ?? memorial.displayName);
  const [endText,      setEndText]      = useState(existing?.endCardText   ?? 'In Loving Memory');
  const [showOnPage,   setShowOnPage]   = useState(existing?.showOnMemorial ?? false);
  const [previewIdx,   setPreviewIdx]   = useState(-1); // -1 = title card
  const [renderState,  setRenderState]  = useState<RenderState>('idle');
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStage,  setRenderStage]  = useState('');
  const [downloadUrl,  setDownloadUrl]  = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [photoFilter,  setPhotoFilter]  = useState<'selected' | 'all'>('selected');

  // Auto duration = music length / photo count, min 3s
  const selectedTrack = tracks.find(t => t.id === musicId);
  const autoDuration  = selectedTrack
    ? Math.max(3, Math.round((selectedTrack.durationSeconds / Math.max(timeline.length, 1)) * 10) / 10)
    : 5;

  const totalDuration = timeline.reduce((sum, p) => sum + (p.tributeDuration ?? autoDuration), 0);

  // ── Timeline ops ────────────────────────────────────────────────────────

  function addPhoto(photo: Photo) {
    if (timeline.find(p => p.id === photo.id)) return;
    setTimeline(prev => [...prev, { ...photo, duration: autoDuration }]);
  }

  function removeFromTimeline(id: string) {
    setTimeline(prev => prev.filter(p => p.id !== id));
  }

  function reorder(from: number, to: number) {
    setTimeline(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function setDuration(id: string, secs: number | null) {
    setTimeline(prev => prev.map(p => p.id === id ? { ...p, tributeDuration: secs } : p));
  }

  // ── Save config ──────────────────────────────────────────────────────────

  async function saveConfig() {
    setSaving(true);
    try {
      await fetch(`/api/memorial/${memorial.id}/video`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme,
          musicTrackId:  musicId,
          photoOrder:    timeline.map((p, i) => ({ id: p.id, order: i, duration: p.tributeDuration ?? null })),
          titleCardText: titleText,
          endCardText:   endText,
          showOnMemorial: showOnPage,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  // ── FFmpeg render ────────────────────────────────────────────────────────

// ── FFmpeg render ────────────────────────────────────────────────────────

  async function handleRender() {
    const MAX_PHOTOS = 20;
const photos = timeline.slice(0, MAX_PHOTOS);
    if (timeline.length === 0) return;
    setRenderState('loading_ffmpeg');
    setRenderProgress(0);
    setDownloadUrl(null);

    try {
      setRenderStage('Loading video engine…');
      const { FFmpeg }              = await import('@ffmpeg/ffmpeg');
      const { fetchFile, toBlobURL } = await import('@ffmpeg/util');

      const ffmpeg = new FFmpeg();
      ffmpeg.on('progress', ({ progress }) => {
        setRenderProgress(10 + Math.round(progress * 80)); // 10–90%
      });

      setRenderState('rendering');
      setRenderStage('Loading FFmpeg core…');

      // Self-hosted on R2 (see scripts/upload-ffmpeg-core.ts) to remove
      // the runtime dependency on unpkg.com and avoid Vercel's static-asset
      // bandwidth cap — R2 has zero egress fees. Falls back to unpkg only
      // if the env var isn't set (e.g. local dev without R2 configured).
      const baseURL = process.env.NEXT_PUBLIC_FFMPEG_CORE_URL
        ?? 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`,   'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

// ── Load photos into virtual FS (memory safe) ─────────────────────────
for (let i = 0; i < timeline.length; i++) {
  const photo = timeline[i];

  setRenderStage(`Processing photo ${i + 1} of ${timeline.length}…`);
  setRenderProgress(Math.round((i / timeline.length) * 10));

  if (!photo.url) continue;

  console.log(`[ffmpeg] loading photo ${i}:`, photo.url);

  try {
    // Fetch original image
    const response = await fetch(photo.url);
    const blob = await response.blob();

    // Create image element
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = URL.createObjectURL(blob);

    await new Promise((resolve) => {
      img.onload = resolve;
    });

    // Resize using canvas
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    const MAX_WIDTH = 1280;
    const scale = Math.min(1, MAX_WIDTH / img.width);

    canvas.width = img.width * scale;
    canvas.height = img.height * scale;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Convert to compressed JPEG
    const resizedBlob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85)
    );

    const resizedBuffer = new Uint8Array(await resizedBlob.arrayBuffer());

    // Write to FFmpeg FS
    // Cast: @ffmpeg/util's FileData type and TS's DOM lib disagree on the
    // Uint8Array<ArrayBufferLike> vs Uint8Array<ArrayBuffer> generic here.
    // The runtime value is correct; this is a type-level mismatch only.
    await ffmpeg.writeFile(`photo_${i}.jpg`, resizedBuffer as any);

    console.log(`[ffmpeg] wrote photo_${i}.jpg`);
  } catch (e) {
    console.error(`[ffmpeg] FAILED photo ${i}:`, photo.url, e);
    throw e;
  }
}



// ── Load music ────────────────────────────────────────────────────────
      if (selectedTrack?.previewUrl) {
        const musicUrl = selectedTrack.previewUrl.startsWith('http')
          ? `/api/music/proxy?url=${encodeURIComponent(selectedTrack.previewUrl)}`
          : selectedTrack.previewUrl;
        const musicData = await fetchFile(musicUrl);
        await ffmpeg.writeFile('music.mp3', musicData);
      }

      setRenderStage('Rendering video…');
      setRenderProgress(10);

      // ── Build args ────────────────────────────────────────────────────────
      // IMPORTANT: args must be a flat string[] — never join then split
      const args: string[] = [];

      // One input per photo
      for (let i = 0; i < timeline.length; i++) {
        const dur = timeline[i].tributeDuration ?? autoDuration;
        args.push('-loop', '1', '-t', String(dur), '-i', `photo_${i}.jpg`);
      }

      // Music input (after all photos)
      if (selectedTrack?.previewUrl) {
        args.push('-i', 'music.mp3');
      }

      // Filter complex
      const filterParts: string[] = [];

      // Scale each photo to 1920x1080
      for (let i = 0; i < timeline.length; i++) {
        filterParts.push(
          `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,` +
          `pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${i}]`
        );
      }

      // Crossfade between photos (or just pass through if only one)
      if (timeline.length === 1) {
        // Single photo — rename label to vout
        filterParts[0] = filterParts[0].replace('[v0]', '[vout]');
      } else {
        let offset = 0;
        let lastLabel = 'v0';
        for (let i = 1; i < timeline.length; i++) {
          offset += timeline[i - 1].tributeDuration ?? autoDuration;
          const outLabel = i === timeline.length - 1 ? 'vout' : `xf${i}`;
          filterParts.push(
            `[${lastLabel}][v${i}]xfade=transition=fade:duration=0.5:offset=${offset - 0.5}[${outLabel}]`
          );
          lastLabel = outLabel;
        }
      }

      args.push('-filter_complex', filterParts.join(';'));
      args.push('-map', '[vout]');

      if (selectedTrack?.previewUrl) {
        args.push('-map', `${timeline.length}:a`);
        args.push('-shortest');
        args.push('-c:a', 'aac', '-b:a', '128k');
      }

     args.push(
  '-c:v', 'libx264',
  '-preset', 'fast',
  '-crf', '23',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  'output.mp4'
);

console.log('[ffmpeg] starting render...');
await ffmpeg.exec(args);
console.log('[ffmpeg] render complete');

        const data = await ffmpeg.readFile('output.mp4');
      // Same ArrayBufferLike/ArrayBuffer generic mismatch as writeFile above.
      const blob = new Blob([data as any], { type: 'video/mp4' });
      const url  = URL.createObjectURL(blob);

      setDownloadUrl(url);
      setRenderProgress(92);
      setRenderStage('Saving to server…');

      // ── Upload rendered video to server ──────────────────────────────────
      try {
        const formData = new FormData();
        formData.append('video', blob, 'tribute.mp4');
        const uploadRes = await fetch(`/api/memorial/${memorial.id}/video/upload`, {
          method: 'POST',
          body:   formData,
        });
        if (!uploadRes.ok) {
          console.warn('[video upload] server save failed — local download still available');
        }
      } catch (uploadErr) {
        console.warn('[video upload] server save error:', uploadErr);
        // Non-fatal — the local blob download still works
      }

      setRenderState('done');
      setRenderProgress(100);
      setRenderStage('Done');

      await saveConfig();

    } catch (err) {
      console.error('[FFmpeg render error]', err);
      setRenderState('error');
      setRenderStage((err as Error).message ?? 'Render failed — check browser console for details');
    }
  }
  

  // ── Layout ───────────────────────────────────────────────────────────────

  const inTimeline = new Set(timeline.map(p => p.id));
  const displayPhotos = photoFilter === 'selected'
    ? allPhotos.filter(p => inTimeline.has(p.id))
    : allPhotos;

  const panelHead: React.CSSProperties = {
    fontSize: '0.6rem', letterSpacing: '0.22em', textTransform: 'uppercase',
    color: '#c9a96e', marginBottom: '1rem', fontFamily: 'Georgia, serif',
  };

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem',
    background: '#0a0a1a', border: '1px solid #2a2a3e', borderRadius: 6,
    color: '#c9c2e8', fontSize: '0.85rem', fontFamily: 'Georgia, serif', outline: 'none',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a16', color: '#c9c2e8', fontFamily: 'Georgia, serif' }}>

      {/* Top bar */}
      <div style={{ background: '#0d0c1e', borderBottom: '1px solid #1e1e38', padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', position: 'sticky', top: 0, zIndex: 50 }}>
        <Link href={`/dashboard/memorial/${memorial.id}/photos`}
          style={{ fontSize: '0.75rem', color: '#5a5870', textDecoration: 'none' }}>
          ← Photos
        </Link>
        <span style={{ color: '#2a2a3e' }}>|</span>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#f5f0e8' }}>
          Tribute Video — <span style={{ color: '#c9a96e' }}>{memorial.displayName}</span>
        </p>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.72rem', color: '#5a5870' }}>
          {timeline.length} photo{timeline.length !== 1 ? 's' : ''} · {formatDuration(totalDuration)}
        </span>
        <button onClick={saveConfig} disabled={saving}
          style={{ fontSize: '0.75rem', padding: '0.4rem 1rem', borderRadius: 5, border: '1px solid #2a2a3e', background: saved ? '#065F46' : 'transparent', color: saved ? '#6EE7B7' : '#8a8aaa', cursor: 'pointer' }}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
        </button>
      </div>

      {/* 3-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 280px', height: 'calc(100vh - 53px)', overflow: 'hidden' }}>

        {/* ── LEFT: Photo selector ── */}
        <div style={{ borderRight: '1px solid #1e1e38', overflow: 'auto', padding: '1.25rem 1rem' }}>
          <p style={panelHead}>Photos</p>

          {/* Filter toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: '0.875rem' }}>
            {(['selected', 'all'] as const).map(f => (
              <button key={f} onClick={() => setPhotoFilter(f)}
                style={{ flex: 1, fontSize: '0.65rem', padding: '0.3rem', borderRadius: 4, border: 'none', cursor: 'pointer', fontWeight: 500,
                  background: photoFilter === f ? '#c9a96e' : '#1a1a2e',
                  color:      photoFilter === f ? '#0a0a1a' : '#5a5870' }}>
                {f === 'selected' ? `Selected (${timeline.length})` : `All (${allPhotos.length})`}
              </button>
            ))}
          </div>

          {allPhotos.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem 0.5rem' }}>
              <p style={{ fontSize: '0.75rem', color: '#5a5870', lineHeight: 1.6 }}>
                No photos marked "For Tribute" yet.
              </p>
              <Link href={`/dashboard/memorial/${memorial.id}/photos`}
                style={{ fontSize: '0.72rem', color: '#c9a96e', textDecoration: 'none' }}>
                Go to Photo Manager →
              </Link>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {displayPhotos.map(photo => {
              const inTl = inTimeline.has(photo.id);
              return (
                <div key={photo.id}
                  onClick={() => inTl ? removeFromTimeline(photo.id) : addPhoto(photo)}
                  style={{ position: 'relative', aspectRatio: '1', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', border: `2px solid ${inTl ? '#c9a96e' : 'transparent'}`, background: '#1a1a2e' }}>
                  {photo.url
                    ? <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a3a5e', fontSize: '1.2rem' }}>📷</div>
                  }
                  {inTl && (
                    <div style={{ position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: '50%', background: '#c9a96e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', color: '#0a0a1a', fontWeight: 700 }}>
                      {timeline.findIndex(p => p.id === photo.id) + 1}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CENTRE: Timeline + preview ── */}
        <div style={{ overflow: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Canvas preview */}
          <div>
            <p style={panelHead}>Preview</p>
            <CanvasPreview
              photos={timeline} theme={theme}
              titleText={titleText} endText={endText}
              currentIdx={previewIdx}
            />
            {/* Preview scrubber */}
            <div style={{ display: 'flex', gap: 4, marginTop: '0.75rem', overflowX: 'auto', paddingBottom: 4 }}>
              <button onClick={() => setPreviewIdx(-1)}
                style={{ fontSize: '0.6rem', padding: '0.25rem 0.5rem', borderRadius: 3, border: `1px solid ${previewIdx === -1 ? '#c9a96e' : '#2a2a3e'}`, background: 'transparent', color: previewIdx === -1 ? '#c9a96e' : '#5a5870', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Title
              </button>
              {timeline.map((p, i) => (
                <button key={p.id} onClick={() => setPreviewIdx(i)}
                  style={{ fontSize: '0.6rem', padding: '0.25rem 0.5rem', borderRadius: 3, border: `1px solid ${previewIdx === i ? '#c9a96e' : '#2a2a3e'}`, background: 'transparent', color: previewIdx === i ? '#c9a96e' : '#5a5870', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {i + 1}
                </button>
              ))}
              <button onClick={() => setPreviewIdx(timeline.length)}
                style={{ fontSize: '0.6rem', padding: '0.25rem 0.5rem', borderRadius: 3, border: `1px solid ${previewIdx === timeline.length ? '#c9a96e' : '#2a2a3e'}`, background: 'transparent', color: previewIdx === timeline.length ? '#c9a96e' : '#5a5870', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                End
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <p style={{ ...panelHead, margin: 0 }}>Timeline</p>
              <span style={{ fontSize: '0.65rem', color: '#5a5870' }}>
                Auto duration: {autoDuration.toFixed(1)}s · Total: {formatDuration(totalDuration)}
              </span>
            </div>
            <Timeline
              items={timeline}
              onReorder={reorder}
              onRemove={removeFromTimeline}
              onDurationChange={setDuration}
              autoDuration={autoDuration}
            />
          </div>

          {/* Cards */}
          <div>
            <p style={panelHead}>Cards</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.68rem', color: '#8a8aaa', display: 'block', marginBottom: '0.35rem' }}>Opening title</label>
                <input style={inp} type="text" value={titleText} maxLength={80}
                  onChange={e => setTitleText(e.target.value)} placeholder={memorial.displayName} />
              </div>
              <div>
                <label style={{ fontSize: '0.68rem', color: '#8a8aaa', display: 'block', marginBottom: '0.35rem' }}>Closing card</label>
                <input style={inp} type="text" value={endText} maxLength={80}
                  onChange={e => setEndText(e.target.value)} placeholder="In Loving Memory" />
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Settings + export ── */}
        <div style={{ borderLeft: '1px solid #1e1e38', overflow: 'auto', padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Theme */}
          <div>
            <p style={panelHead}>Theme</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {THEMES.map(t => (
                <div key={t.key} onClick={() => setTheme(t.key)}
                  style={{ padding: '0.6rem 0.75rem', borderRadius: 6, cursor: 'pointer', border: `1px solid ${theme === t.key ? '#c9a96e' : '#2a2a3e'}`, background: theme === t.key ? 'rgba(201,169,110,0.08)' : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, background: t.accent, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.78rem', color: theme === t.key ? '#c9a96e' : '#c9c2e8', fontWeight: 500 }}>{t.label}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.65rem', color: '#5a5870' }}>{t.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Music */}
          <div>
            <p style={panelHead}>Music</p>
            <MusicPicker tracks={tracks} selectedId={musicId} onSelect={setMusicId} />
          </div>

          {/* Show on memorial toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#0d0c1e', borderRadius: 8, border: '1px solid #1e1e38' }}>
            <input type="checkbox" id="showOnPage" checked={showOnPage} onChange={e => setShowOnPage(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: '#c9a96e' }} />
            <label htmlFor="showOnPage" style={{ fontSize: '0.78rem', color: '#8a8aaa', cursor: 'pointer', lineHeight: 1.4 }}>
              Show video on memorial page
            </label>
          </div>

          {/* Render + export */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={panelHead}>Export</p>

            {renderState === 'rendering' || renderState === 'loading_ffmpeg' ? (
              <RenderProgress progress={renderProgress} stage={renderStage} />
            ) : (
              <>
                <button
                  onClick={handleRender}
                  disabled={timeline.length === 0}
                  style={{
                    padding: '0.875rem', borderRadius: 8, border: 'none', cursor: timeline.length > 0 ? 'pointer' : 'not-allowed',
                    background: timeline.length > 0 ? 'linear-gradient(135deg, #c9a96e, #e8c87e)' : '#1a1a2e',
                    color: timeline.length > 0 ? '#0a0a1a' : '#3a3a5e',
                    fontWeight: 700, fontSize: '0.875rem', fontFamily: 'Georgia, serif',
                    transition: 'opacity 0.15s',
                  }}>
                  {renderState === 'error' ? '⚠ Retry Render' : '▶ Render Video'}
                </button>

                {renderState === 'error' && (
                  <p style={{ fontSize: '0.72rem', color: '#f87171' }}>{renderStage}</p>
                )}
              </>
            )}

            {downloadUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <a href={downloadUrl} download={`${memorial.displayName.replace(/\s+/g, '-')}-tribute.mp4`}
                  style={{ display: 'block', padding: '0.75rem', textAlign: 'center', borderRadius: 8, border: '1px solid #c9a96e', color: '#c9a96e', textDecoration: 'none', fontSize: '0.85rem', fontFamily: 'Georgia, serif' }}>
                  ↓ Download MP4
                </a>
                <p style={{ fontSize: '0.65rem', color: '#5a5870', textAlign: 'center', margin: 0 }}>
                  HD 1080p · Chapel screen ready
                </p>
              </div>
            )}

            {timeline.length === 0 && (
              <p style={{ fontSize: '0.72rem', color: '#5a5870', textAlign: 'center' }}>
                Add at least one photo to render
              </p>
            )}

            <p style={{ fontSize: '0.65rem', color: '#3a3a5e', lineHeight: 1.6 }}>
              Renders in your browser — no upload required. A 3-minute video with 20 photos takes ~2 minutes on modern hardware.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}


//error in download format//
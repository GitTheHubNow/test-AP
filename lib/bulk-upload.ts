// lib/bulk-upload.ts
//
// Shared (client + server) rules for staff BULK uploads to a memorial's
// Collection. Pure functions only — no Node APIs, no DB — so the browser can
// pre-check a drop of 300 files with exactly the same logic the server
// re-runs, and so it is cheap to unit-test.
//
// The per-memorial storage cap itself (5GB) lives in lib/storage-quota.ts and
// is the single source of truth; this file only receives "remainingBytes".
//
// Per-file limits deliberately match the existing single-file routes
// (50MB photos/docs like api/memorial/[id]/collection, 200MB video like
// api/memorial/[id]/video/upload) so bulk upload is not a way around them.

export type BulkItemType = 'PHOTO' | 'VIDEO' | 'DOCUMENT';

export const BULK_LIMITS = {
  /** Files per prepare/complete round trip. Larger drops are done in runs. */
  maxFilesPerBatch: 100,
  maxFileNameLength: 255,
  maxBytes: {
    PHOTO:    50 * 1024 * 1024,
    DOCUMENT: 50 * 1024 * 1024,
    VIDEO:   200 * 1024 * 1024,
  } as Record<BulkItemType, number>,
} as const;

/** Same allow-lists as the single-file staff route. */
const MIME_BY_TYPE: Record<BulkItemType, string[]> = {
  PHOTO:    ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  VIDEO:    ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'],
  DOCUMENT: ['application/pdf', 'application/msword',
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

/** Browsers often send '' (HEIC especially) or application/octet-stream. */
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', webm: 'video/webm',
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export const BULK_ACCEPT_ATTR = Object.keys(MIME_BY_EXT).map((e) => `.${e}`).join(',');

export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,6})$/.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

/** The declared type if it is one we accept, else a guess from the extension. */
export function resolveMimeType(name: string, declared: string): string {
  const d = (declared || '').toLowerCase();
  if (Object.values(MIME_BY_TYPE).some((list) => list.includes(d))) return d;
  return MIME_BY_EXT[extensionOf(name)] ?? '';
}

export function typeForMime(mime: string): BulkItemType | null {
  for (const t of Object.keys(MIME_BY_TYPE) as BulkItemType[]) {
    if (MIME_BY_TYPE[t].includes(mime)) return t;
  }
  return null;
}

export interface BulkFileInput { name: string; type: string; size: number }

export interface BulkAccepted {
  index:    number;
  name:     string;
  mimeType: string;
  type:     BulkItemType;
  size:     number;
}
export interface BulkRejected { index: number; name: string; reason: string }

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024)      return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/**
 * Decide which files of a drop can be uploaded.
 *
 * Files are considered IN ORDER. Each must be a supported type, within its
 * per-file limit, and must still fit in `remainingBytes` after the files
 * accepted before it — so a drop that is too big for the memorial's 5GB cap
 * uploads as many files as fit (in the order given) and clearly rejects the
 * rest, rather than failing the whole batch or going over.
 */
export function planBulkBatch(
  files: BulkFileInput[],
  remainingBytes: number,
): { accepted: BulkAccepted[]; rejected: BulkRejected[]; acceptedBytes: number } {
  const accepted: BulkAccepted[] = [];
  const rejected: BulkRejected[] = [];
  let acceptedBytes = 0;

  files.forEach((f, index) => {
    const name = typeof f?.name === 'string' ? f.name : '';
    const reject = (reason: string) => rejected.push({ index, name: name || `file ${index + 1}`, reason });

    if (!name.trim() || name.length > BULK_LIMITS.maxFileNameLength) return reject('Invalid file name');
    if (!Number.isInteger(f.size) || f.size <= 0) return reject('File is empty');

    const mimeType = resolveMimeType(name, typeof f.type === 'string' ? f.type : '');
    const type = typeForMime(mimeType);
    if (!type) return reject('Unsupported file type');

    const max = BULK_LIMITS.maxBytes[type];
    if (f.size > max) return reject(`Too large (max ${formatBytes(max)} for ${type.toLowerCase()}s)`);

    if (acceptedBytes + f.size > remainingBytes) {
      return reject("Would exceed this memorial's storage limit");
    }

    acceptedBytes += f.size;
    accepted.push({ index, name, mimeType, type, size: f.size });
  });

  return { accepted, rejected, acceptedBytes };
}

/** Keys the server hands out look like collection/<memorialId>/<uuid>.<ext>. */
export function isBulkKeyForMemorial(key: unknown, memorialId: string): key is string {
  if (typeof key !== 'string') return false;
  const safeId = memorialId.replace(/[^A-Za-z0-9_-]/g, '');
  if (safeId !== memorialId) return false;
  return new RegExp(`^collection/${safeId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.[a-z0-9]{1,6}$`).test(key);
}

/** "IMG_4821.JPG" -> "IMG_4821" (used as the item's default title). */
export function titleFromFileName(name: string): string {
  return name.replace(/\.[A-Za-z0-9]{1,6}$/, '').trim().slice(0, 120) || name.slice(0, 120);
}

/**
 * Narrow an already-planned batch: keep only `allowedTypes` (e.g. photos only
 * for the public family link) and at most `maxAccept` files (e.g. what is left
 * of a link's upload allowance). Order is preserved; everything dropped comes
 * back as a rejection with a reason.
 */
export function narrowPlan(
  plan: { accepted: BulkAccepted[]; rejected: BulkRejected[] },
  opts: { allowedTypes?: BulkItemType[]; maxAccept?: number },
): { accepted: BulkAccepted[]; rejected: BulkRejected[] } {
  let accepted = plan.accepted;
  const rejected = [...plan.rejected];

  if (opts.allowedTypes) {
    const ok = new Set(opts.allowedTypes);
    const wrong = accepted.filter((a) => !ok.has(a.type));
    accepted = accepted.filter((a) => ok.has(a.type));
    rejected.push(...wrong.map((a) => ({ index: a.index, name: a.name, reason: 'Unsupported file type' })));
  }
  if (opts.maxAccept !== undefined && accepted.length > opts.maxAccept) {
    const keep = Math.max(0, opts.maxAccept);
    const extra = accepted.slice(keep);
    accepted = accepted.slice(0, keep);
    rejected.push(...extra.map((a) => ({ index: a.index, name: a.name, reason: 'Upload limit reached for this link' })));
  }
  rejected.sort((a, b) => a.index - b.index);
  return { accepted, rejected };
}

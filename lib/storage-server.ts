/**
 * lib/storage-server.ts
 *
 * SERVER-ONLY storage operations.
 * Never import this in a client component — it uses Node.js fs and AWS SDK.
 *
 * Import in API routes and server components only.
 */

// ============================================================================
// SAVE
// ============================================================================

export async function saveUploadedFile(file: File, prefix: string): Promise<string> {
  const { randomUUID } = await import('crypto');
  const ext     = getExtension(file.name, file.type);
  const blobKey = `${prefix.replace(/\/$/, '')}/${randomUUID()}${ext}`;
  const buffer  = Buffer.from(await file.arrayBuffer());

  if (process.env.NODE_ENV === 'production') {
    const { s3Upload } = await import('./storage-s3');
    await s3Upload(blobKey, buffer, file.type);
  } else {
    await writeToDisk(blobKey, buffer);
  }

  return blobKey;
}

// ============================================================================
// DELETE
// ============================================================================

export async function deleteFile(blobKey: string): Promise<void> {
  if (!blobKey) return;

  if (process.env.NODE_ENV === 'production') {
    const { s3Delete } = await import('./storage-s3');
    await s3Delete(blobKey);
  } else {
    await deleteFromDisk(blobKey);
  }
}

// ============================================================================
// SIGNED URL (prod only — returns public URL in dev)
// ============================================================================

export async function getSignedDownloadUrl(blobKey: string, expiresIn = 3600): Promise<string> {
  const { getPublicUrl } = await import('./upload-shared');
  if (process.env.NODE_ENV !== 'production') return getPublicUrl(blobKey);
  const { s3SignedUrl } = await import('./storage-s3');
  return s3SignedUrl(blobKey, expiresIn);
}

// ============================================================================
// INTERNAL: LOCAL DISK (dev only)
// ============================================================================

async function writeToDisk(blobKey: string, buffer: Buffer): Promise<void> {
  const path = await import('path');
  const fs   = await import('fs/promises');
  const fullPath = path.join(process.cwd(), 'public', 'uploads', blobKey);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer);
}

async function deleteFromDisk(blobKey: string): Promise<void> {
  try {
    const path = await import('path');
    const fs   = await import('fs/promises');
    await fs.unlink(path.join(process.cwd(), 'public', 'uploads', blobKey));
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err;
  }
}

// ============================================================================
// INTERNAL: UTILITIES
// ============================================================================

function getExtension(filename: string, mimeType: string): string {
  const lower = filename.toLowerCase();

  // Images
  if (lower.endsWith('.heic') || mimeType === 'image/heic') return '.heic';
  if (lower.endsWith('.heif') || mimeType === 'image/heif') return '.heif';
  if (lower.endsWith('.webp') || mimeType === 'image/webp') return '.webp';
  if (lower.endsWith('.png')  || mimeType === 'image/png')  return '.png';
  if (lower.endsWith('.gif')  || mimeType === 'image/gif')  return '.gif';
  // SVG was previously unhandled here — fell through to '.jpg' — even
  // though nothing currently sends image/svg+xml into saveUploadedFile
  // (see the logo route fix, which removed SVG uploads entirely), this
  // is still the correct general behaviour for the function.
  if (lower.endsWith('.svg')  || mimeType === 'image/svg+xml') return '.svg';

  // Video — was entirely unhandled: every video saved via
  // saveUploadedFile() (tribute videos, collection video uploads) fell
  // through to '.jpg' too. In production this is masked because
  // storage-s3.ts sets the real Content-Type from file.type regardless
  // of the key's extension, but in local dev the file is served from
  // disk by extension, so a video saved as "<uuid>.jpg" would be served
  // as Content-Type: image/jpeg and fail to play in a <video> tag.
  if (lower.endsWith('.mp4')  || mimeType === 'video/mp4')        return '.mp4';
  if (lower.endsWith('.mov')  || mimeType === 'video/quicktime')  return '.mov';
  if (lower.endsWith('.webm') || mimeType === 'video/webm')       return '.webm';
  if (lower.endsWith('.avi')  || mimeType === 'video/x-msvideo') return '.avi';

  // Documents — same fall-through-to-.jpg issue for the DOCUMENT type
  // accepted by the collection upload routes.
  if (lower.endsWith('.pdf')  || mimeType === 'application/pdf') return '.pdf';
  if (lower.endsWith('.docx') || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return '.docx';
  if (lower.endsWith('.doc')  || mimeType === 'application/msword') return '.doc';

  return '.jpg';
}

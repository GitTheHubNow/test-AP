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
  if (lower.endsWith('.heic') || mimeType === 'image/heic') return '.heic';
  if (lower.endsWith('.heif') || mimeType === 'image/heif') return '.heif';
  if (lower.endsWith('.webp') || mimeType === 'image/webp') return '.webp';
  if (lower.endsWith('.png')  || mimeType === 'image/png')  return '.png';
  if (lower.endsWith('.gif')  || mimeType === 'image/gif')  return '.gif';
  return '.jpg';
}

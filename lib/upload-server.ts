/**
 * Server-only upload utilities
 * Handles file storage and processing (Node.js modules)
 * 
 * ⚠️ IMPORTANT: Only import this in Server Components and API Routes
 * DO NOT import in Client Components
 */

import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { UPLOAD_CONFIG } from './upload-shared';

// ============================================================================
// TYPES
// ============================================================================

export interface UploadResult {
  success: boolean;
  blobKey?: string;
  mimeType?: string;
  sizeBytes?: number;
  error?: string;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };
  return map[mimeType] || '.jpg';
}

/**
 * Generate unique storage key
 * Format: YYYY/MM/uuid.ext
 */
function generateBlobKey(mimeType: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const uuid = randomUUID();
  const ext = getExtensionFromMimeType(mimeType);
  
  return `${year}/${month}/${uuid}${ext}`;
}

/**
 * Ensure upload directory exists
 */
async function ensureUploadDirectory(blobKey: string): Promise<void> {
  const dirPath = path.join(UPLOAD_CONFIG.UPLOAD_DIR, path.dirname(blobKey));
  await mkdir(dirPath, { recursive: true });
}

/**
 * Save file to local storage
 */
async function saveFile(buffer: Buffer, blobKey: string): Promise<string> {
  try {
    await ensureUploadDirectory(blobKey);
    const filePath = path.join(UPLOAD_CONFIG.UPLOAD_DIR, blobKey);
    await writeFile(filePath, buffer);
    return filePath;
  } catch (error) {
    console.error('[Upload] Failed to save file:', error);
    throw new Error('Failed to save file to storage');
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate file type by MIME type
 */
function validateFileType(mimeType: string): { valid: boolean; error?: string } {
  if (!UPLOAD_CONFIG.ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${UPLOAD_CONFIG.ALLOWED_MIME_TYPES.join(', ')}`,
    };
  }
  return { valid: true };
}

/**
 * Validate file size
 */
function validateFileSize(sizeBytes: number): { valid: boolean; error?: string } {
  if (sizeBytes > UPLOAD_CONFIG.MAX_FILE_SIZE) {
    const maxMB = UPLOAD_CONFIG.MAX_FILE_SIZE / (1024 * 1024);
    return {
      valid: false,
      error: `File too large. Maximum size: ${maxMB}MB`,
    };
  }
  if (sizeBytes === 0) {
    return {
      valid: false,
      error: 'File is empty',
    };
  }
  return { valid: true };
}

/**
 * Validate uploaded file completely
 */
function validateFile(
  buffer: Buffer,
  mimeType: string,
  sizeBytes: number
): { valid: boolean; error?: string } {
  const typeValidation = validateFileType(mimeType);
  if (!typeValidation.valid) {
    return typeValidation;
  }

  const sizeValidation = validateFileSize(sizeBytes);
  if (!sizeValidation.valid) {
    return sizeValidation;
  }

  return { valid: true };
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Process and save uploaded file
 * 
 * @param buffer - File buffer
 * @param mimeType - MIME type
 * @param sizeBytes - File size in bytes
 * @returns Upload result with blobKey
 */
export async function processUpload(
  buffer: Buffer,
  mimeType: string,
  sizeBytes: number
): Promise<UploadResult> {
  try {
    // Validate
    const validation = validateFile(buffer, mimeType, sizeBytes);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    // Generate storage key
    const blobKey = generateBlobKey(mimeType);

    // Save to storage
    await saveFile(buffer, blobKey);

    return {
      success: true,
      blobKey,
      mimeType,
      sizeBytes,
    };
  } catch (error) {
    console.error('[Upload] Process failed:', error);
    return {
      success: false,
      error: 'Failed to process upload',
    };
  }
}

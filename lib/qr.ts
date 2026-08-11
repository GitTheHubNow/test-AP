/**
 * QR Code utilities
 *
 * Phase 3A - Feature 1: QR Download
 *
 * ✅ Token generation for new memorials
 * ✅ Token verification for public access
 * ✅ QR code generation for display & download
 */

import QRCode from 'qrcode';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';

// ============================================================================
// TYPES
// ============================================================================

export interface QRCodeOptions {
  width?: number;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  color?: {
    dark?: string;
    light?: string;
  };
}

export interface GenerateQRResult {
  success: boolean;
  dataUrl?: string;
  error?: string;
}

// ============================================================================
// TOKEN GENERATION & VERIFICATION
// ============================================================================

/**
 * Generate a cryptographically secure random token for a new memorial.
 * This is the raw token that gets embedded in QR codes and URLs.
 *
 * @returns A random 64-character hex string
 */
export function generateQRToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Generate a public token for the /v/[slug]?key={publicToken} public URL
 * scheme (Phase 17). 24-char URL-safe, lowercase hex, hyphens removed.
 * e.g. "a1b2c3d4e5f6a7b8c9d0e1f2"
 *
 * This is the single canonical implementation — previously duplicated
 * inline in app/api/memorials/[id]/qr/route.ts and copy-pasted into
 * several other call sites during the /m/ → /v/ migration. Import this
 * instead of re-implementing it.
 */
export function generatePublicToken(): string {
  return randomUUID().replace(/-/g, '').slice(0, 24);
}

/**
 * Ensure a memorial has a publicToken, generating and persisting one if it
 * doesn't. publicToken is generated lazily (first time someone needs a
 * public link — QR panel, welcome email, handover email, legacy /m/
 * redirect, etc.) rather than at memorial creation, so any of those call
 * sites may be the first to need it. Centralising the check-generate-persist
 * sequence here avoids each call site reimplementing it slightly differently.
 *
 * @param memorialId - id of the memorial to check/update
 * @param existingToken - the publicToken value already fetched by the
 *   caller's own query, if any (pass memorial.publicToken here) — avoids
 *   a redundant DB read when the caller already has the row.
 * @returns the memorial's publicToken, generating one if needed
 */
export async function ensurePublicToken(
  memorialId: string,
  existingToken: string | null | undefined,
): Promise<string> {
  if (existingToken) return existingToken;

  const publicToken = generatePublicToken();
  await prisma.memorial.update({
    where: { id: memorialId },
    data:  { publicToken },
  });
  return publicToken;
}

/**
 * Verify a QR token and return the matching memorial.
 *
 * publicMemorial.ts imports this to look up a memorial by its raw QR token.
 * We hash the token and look it up against the stored hash.
 *
 * @param token - Raw QR token from the URL
 * @returns The memorial record, or null if not found
 */
export async function verifyQrToken(token: string) {
  try {
    // Hash the token to match against stored qrTokenHash
    const tokenHash = createHash('sha256')
      .update(token)
      .digest('hex');

    const memorial = await prisma.memorial.findUnique({
      where: { qrTokenHash: tokenHash },
    });

    return memorial ?? null;
  } catch (error) {
    console.error('[QR] verifyQrToken failed:', error);
    return null;
  }
}

// ============================================================================
// QR CODE GENERATION
// ============================================================================

/**
 * Generate QR code as a data URL (base64 PNG image).
 *
 * @param url     - URL to encode
 * @param options - Optional styling
 */
export async function generateQRCode(
  url: string,
  options: QRCodeOptions = {}
): Promise<GenerateQRResult> {
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      width: options.width || 512,
      margin: options.margin || 2,
      errorCorrectionLevel: options.errorCorrectionLevel || 'M',
      color: {
        dark: options.color?.dark || '#000000',
        light: options.color?.light || '#FFFFFF',
      },
    });

    return { success: true, dataUrl };
  } catch (error) {
    console.error('[QR] generateQRCode failed:', error);
    return { success: false, error: 'Failed to generate QR code' };
  }
}

/**
 * Generate a QR code for a memorial's public page.
 *
 * CHANGED: previously took a single `token` (qrTokenHash) and built
 * /m/{token}. Now takes `slug` + `publicToken` separately and builds
 * /v/{slug}?key={publicToken} — matching the gate system in
 * app/v/[slug]/page.tsx. Callers passing the old single-token signature
 * need updating (see job-send-after-days.ts's TODO comment, which was
 * already flagging this exact reconstruction problem before this change).
 *
 * @param slug        - The memorial's slug (lib/memorial/slug.ts)
 * @param publicToken - The memorial's publicToken (the actual access secret)
 * @param appUrl      - Base URL of the app
 */
export async function generateMemorialQR(
  slug: string,
  publicToken: string,
  appUrl: string = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
): Promise<GenerateQRResult> {
  const url = `${appUrl}/v/${slug}?key=${publicToken}`;
  return generateQRCode(url, {
    width: 512,
    errorCorrectionLevel: 'H', // High correction level — better for printing
  });
}

/**
 * Generate QR code as a raw PNG Buffer (for file downloads / email attachments).
 *
 * @param url     - URL to encode
 * @param options - Optional styling
 */
export async function generateQRBuffer(
  url: string,
  options: QRCodeOptions = {}
): Promise<Buffer> {
  const buffer = await QRCode.toBuffer(url, {
    width: options.width || 512,
    margin: options.margin || 2,
    errorCorrectionLevel: options.errorCorrectionLevel || 'H',
    color: {
      dark: options.color?.dark || '#000000',
      light: options.color?.light || '#FFFFFF',
    },
  });

  return buffer;
}

/**
 * Email sending utilities using Resend
 * 
 * Phase 2B: Email Notifications
 * 
 * ✅ Architecture Compliant:
 * - Server-side only (never import in client components)
 * - Async, non-blocking
 * - Fail-safe (logs errors, doesn't crash)
 * - Environment variable based
 */

import { Resend } from 'resend';

// ============================================================================
// CONFIGURATION
// ============================================================================

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

if (!RESEND_API_KEY) {
  console.warn('[Email] RESEND_API_KEY not set - emails will not be sent');
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// ============================================================================
// TYPES
// ============================================================================

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// CORE UTILITIES
// ============================================================================

/**
 * Send an email using Resend
 * 
 * This is async and non-blocking. If it fails, it logs the error
 * but doesn't crash the app.
 * 
 * @param params - Email parameters
 * @returns Promise with success status
 */
export async function sendEmail(params: SendEmailParams): Promise<EmailResult> {
  // If no API key, skip sending (development mode)
  if (!resend) {
    console.log('[Email] Skipping (no API key):', params.subject);
    return { success: false, error: 'No API key configured' };
  }

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    console.log('[Email] Sent successfully:', params.subject, 'to', params.to);
    return { success: true };

  } catch (error) {
    console.error('[Email] Failed to send:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send email without awaiting (fire-and-forget)
 * 
 * Use this in API routes where you don't want to block the response
 * 
 * @param params - Email parameters
 */
export function sendEmailAsync(params: SendEmailParams): void {
  // Don't await - fire and forget
  sendEmail(params).catch((error) => {
    console.error('[Email] Async send failed:', error);
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the base app URL for links
 */
export function getAppUrl(): string {
  return APP_URL;
}

/**
 * Generate moderation dashboard URL
 */
export function getModerationUrl(memorialId: string): string {
  return `${APP_URL}/dashboard/memorial/${memorialId}/moderation`;
}

/**
 * Generate public memorial URL.
 *
 * FIXED: previously built the retired `/m/{token}` shape. Public memorial
 * viewing now lives at `/v/{slug}?key={publicToken}` (see app/v/[slug]).
 * Takes both slug and publicToken — slug falls back to memorialId only if
 * a memorial genuinely has no slug yet (should not normally happen once
 * slug is set at creation time per lib/memorial/slug.ts).
 */
export function getMemorialUrl(slug: string, publicToken: string): string {
  return `${APP_URL}/v/${slug}?key=${publicToken}`;
}

/**
 * Generate dashboard URL
 */
export function getDashboardUrl(): string {
  return `${APP_URL}/dashboard/memorials`;
}

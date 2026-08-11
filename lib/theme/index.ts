// lib/theme/index.ts
//
// Resolves organisation branding into a typed theme object for public pages.
// Never throws — always returns a valid theme.
//
// Design tokens match V1 UI exactly:
//   primaryColor   #c9a96e — from CreateMemorialForm border focus, badge colours
//   secondaryColor #0a0a16 — page background throughout V1
// Changing these would break V1 memorial page appearance.

import { prisma } from '@/lib/prisma';
import type { ResolvedTheme } from '@/types/v2';

// ── Defaults ──────────────────────────────────────────────────────────────────

export const MEMORIAM_DEFAULTS: ResolvedTheme = {
  brandName:        'Memoriam',
  logoUrl:          null,
  primaryColor:     '#c9a96e',
  secondaryColor:   '#0a0a16',
  supportEmail:     null,
  poweredByEnabled: true,
  isWhiteLabel:     false,
};

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Resolves branding for a given organisationId.
 *
 * When isWhiteLabelEnabled = false (all 3 current funeral homes):
 *   Returns MEMORIAM_DEFAULTS. Nothing changes for them.
 *
 * When isWhiteLabelEnabled = true:
 *   Returns org branding with safe fallback chain.
 *
 * Never throws. Logs DB errors and returns defaults.
 */
export async function resolveTheme(organisationId: string | null): Promise<ResolvedTheme> {
  if (!organisationId) {
    return MEMORIAM_DEFAULTS;
  }

  try {
    const org = await prisma.organisation.findUnique({
      where: { id: organisationId },
      select: {
        name:                true,
        brandName:           true,
        logoUrl:             true,
        primaryColor:        true,
        secondaryColor:      true,
        brandColor:          true,   // V1 legacy — fallback for primaryColor
        supportEmail:        true,
        poweredByEnabled:    true,
        isWhiteLabelEnabled: true,
      },
    });

    if (!org) return MEMORIAM_DEFAULTS;

    if (!org.isWhiteLabelEnabled) {
      return MEMORIAM_DEFAULTS;
    }

    return {
      brandName:        org.brandName ?? org.name,
      logoUrl:          org.logoUrl ?? null,
      primaryColor:     org.primaryColor ?? org.brandColor ?? MEMORIAM_DEFAULTS.primaryColor,
      secondaryColor:   org.secondaryColor ?? MEMORIAM_DEFAULTS.secondaryColor,
      supportEmail:     org.supportEmail ?? null,
      poweredByEnabled: org.poweredByEnabled,
      isWhiteLabel:     true,
    };
  } catch (err) {
    console.error('[theme/resolveTheme] DB error, falling back to defaults:', err);
    return MEMORIAM_DEFAULTS;
  }
}

/**
 * Convenience wrapper — resolves theme by memorial ID.
 * Looks up memorial's organisationId, then resolves theme.
 */
export async function resolveThemeForMemorial(memorialId: string): Promise<ResolvedTheme> {
  try {
    const memorial = await prisma.memorial.findUnique({
      where:  { id: memorialId },
      select: { organisationId: true },
    });
    return resolveTheme(memorial?.organisationId ?? null);
  } catch (err) {
    console.error('[theme/resolveThemeForMemorial] DB error, falling back to defaults:', err);
    return MEMORIAM_DEFAULTS;
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function isValidHexColor(value: string): boolean {
  return HEX_RE.test(value);
}

/**
 * Validates and sanitises an incoming branding update body.
 * Throws 400 errors for invalid values.
 * Returns only the fields that are present and valid.
 */
export function validateBrandingUpdate(body: Record<string, unknown>): {
  brandName?:        string;
  logoUrl?:          string | null;
  primaryColor?:     string;
  secondaryColor?:   string;
  supportEmail?:     string | null;
  poweredByEnabled?: boolean;
} {
  const result: ReturnType<typeof validateBrandingUpdate> = {};

  if ('brandName' in body) {
    if (typeof body.brandName !== 'string' || body.brandName.trim().length === 0) {
      throw Object.assign(new Error('brandName must be a non-empty string'), { status: 400 });
    }
    result.brandName = body.brandName.trim().slice(0, 120);
  }

  if ('logoUrl' in body) {
    if (body.logoUrl !== null && typeof body.logoUrl !== 'string') {
      throw Object.assign(new Error('logoUrl must be a string or null'), { status: 400 });
    }
    result.logoUrl = body.logoUrl as string | null;
  }

  if ('primaryColor' in body) {
    if (typeof body.primaryColor !== 'string' || !isValidHexColor(body.primaryColor)) {
      throw Object.assign(
        new Error('primaryColor must be a 6-digit hex colour e.g. #1a2b3c'),
        { status: 400 },
      );
    }
    result.primaryColor = body.primaryColor;
  }

  if ('secondaryColor' in body) {
    if (typeof body.secondaryColor !== 'string' || !isValidHexColor(body.secondaryColor)) {
      throw Object.assign(
        new Error('secondaryColor must be a 6-digit hex colour e.g. #1a2b3c'),
        { status: 400 },
      );
    }
    result.secondaryColor = body.secondaryColor;
  }

  if ('supportEmail' in body) {
    if (body.supportEmail !== null && typeof body.supportEmail !== 'string') {
      throw Object.assign(new Error('supportEmail must be a string or null'), { status: 400 });
    }
    result.supportEmail = body.supportEmail as string | null;
  }

  if ('poweredByEnabled' in body) {
    if (typeof body.poweredByEnabled !== 'boolean') {
      throw Object.assign(new Error('poweredByEnabled must be a boolean'), { status: 400 });
    }
    result.poweredByEnabled = body.poweredByEnabled;
  }

  return result;
}

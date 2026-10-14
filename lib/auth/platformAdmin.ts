// lib/auth/platformAdmin.ts
//
// Platform-admin check for /api/system/* routes (compliance, health,
// performance). These are operator-only endpoints — they report on or
// across the whole platform, not a single funeral home's data, so the
// existing org-role system (OWNER/ADMIN/MEMBER/VIEWER) doesn't apply here:
// an OWNER at a funeral home should NOT be able to pull platform-wide
// compliance data.
//
// Deliberately simple for current scale (you, the operator, plus a
// handful of funeral homes): a Clerk user ID allowlist via env var.
// If/when you have a real internal team, upgrade this to a DB-backed
// platform role instead of extending this list by hand.

const PLATFORM_ADMIN_IDS = (process.env.PLATFORM_ADMIN_USER_IDS ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

export function getPlatformAdminIds(): string[] {
  return [...PLATFORM_ADMIN_IDS];
}

export function isPlatformAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return PLATFORM_ADMIN_IDS.includes(userId);
}

/**
 * Throws a 403-shaped error if the user is not a platform admin.
 * Callers should catch and translate to a Response, matching each
 * route's existing error style (see usage in app/api/system/*).
 */
export function assertPlatformAdmin(userId: string | null | undefined): void {
  if (!isPlatformAdmin(userId)) {
    const err: any = new Error('Platform admin access required');
    err.status = 403;
    throw err;
  }
}

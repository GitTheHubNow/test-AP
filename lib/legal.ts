// lib/legal.ts
//
// Single source of truth for the current Terms of Service / Privacy
// Policy version, stored alongside every consent record (see
// Organisation.termsAcceptedVersion in prisma/schema.prisma) so a future
// material change can be detected by comparison, not just inferred from
// a boolean.
//
// Update this whenever app/terms/page.tsx or app/privacy/page.tsx
// changes in a way that needs re-consent — a typo fix doesn't; a change
// to what data is collected, how it's used, or the billing/cancellation
// terms does. Update the "Last updated" line on both pages at the same
// time so the displayed date and this stored version stay in sync.

export const CURRENT_TERMS_VERSION = '2026-09-21';

// lib/handoverEmail.ts
//
// Who may accept a memorial handover? Previously: anyone signed in who held
// the link. The accept link is a bearer token, so a forwarded or intercepted
// email handed a stranger ownership of a family's memorial. Now the signed-in
// account must own a VERIFIED email address equal to the one the funeral home
// entered as the family contact.

export interface ClerkEmailLike {
  emailAddress: string;
  verification?: { status?: string | null } | null;
}

const norm = (s: string) => s.trim().toLowerCase();

/** The account's email addresses that Clerk has actually verified. */
export function verifiedEmails(addresses: ClerkEmailLike[]): string[] {
  return addresses.filter((a) => a.verification?.status === 'verified').map((a) => norm(a.emailAddress));
}

/** True if any VERIFIED address equals the family contact email (case-insensitive, trimmed). */
export function hasMatchingVerifiedEmail(addresses: ClerkEmailLike[], familyContactEmail: string): boolean {
  const target = norm(familyContactEmail);
  if (!target) return false; // never match an empty contact email
  return verifiedEmails(addresses).includes(target);
}

/** "jane.smith@gmail.com" → "j***@gmail.com" — enough for the family to recognise, not enough to harvest. */
export function maskEmail(email: string): string {
  const [local, domain] = email.trim().split('@');
  if (!local || !domain) return '***';
  return `${local[0]}***@${domain}`;
}

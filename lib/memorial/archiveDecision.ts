// lib/memorial/archiveDecision.ts
//
// Pure decision logic for whether a memorial can be archived. Originally
// extracted out of the memorial DELETE handler so the actual safety rule
// (sealed records can't be archived) is unit-testable rather than
// trusted by inspection alone. "DELETE" on that route is actually a
// soft archive (MemorialStatus.ARCHIVED), not a hard delete — Memory and
// Media both carry an ON DELETE RESTRICT constraint back to Memorial
// (verified against the real applied migration, not just schema.prisma),
// so Postgres itself would refuse a hard delete on any memorial with
// content regardless.
//
// Reused by app/api/family-access/[memorialId]/visibility/route.ts for
// the family self-service "hide memorial" action — same operation, same
// safety rule, just reached through the family session instead of
// assertMemorialAccess.

export type ArchiveDecision =
  | { action: 'archive' }               // proceed with status → ARCHIVED
  | { action: 'noop' }                  // already archived — treat as success
  | { action: 'reject'; reason: string; status: number };

export function decideArchiveAction(memorial: {
  sealed: boolean;
  status: string;
}): ArchiveDecision {
  // A sealed memorial is a finalised, immutable record. Archiving is a
  // status change, and sealing exists specifically to freeze that kind
  // of change — an intentional exception (unsealing first) should
  // require a human decision, not happen silently via this button.
  if (memorial.sealed) {
    return {
      action: 'reject',
      reason: 'This memorial is sealed and cannot be archived. Unseal it first if this is intentional.',
      status: 409,
    };
  }

  if (memorial.status === 'ARCHIVED') {
    // Already in the end state the caller wants — success, not an error.
    return { action: 'noop' };
  }

  return { action: 'archive' };
}

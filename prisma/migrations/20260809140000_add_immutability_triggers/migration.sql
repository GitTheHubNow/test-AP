-- Immutability enforcement at the database layer — defence in depth
-- alongside the existing application-level sealMemorial()/sealMemory()
-- and content-hash verification in lib/immutability.ts.
--
-- This does NOT replace the application-level system. It exists so that
-- a direct SQL statement, a bug in application code, or a future
-- developer who forgets the app-level check cannot bypass the rule that
-- a sealed memorial or memory must never be changed or removed.
--
-- Rule, matching the application's existing one-way seal:
--   sealed = false  -> UPDATE and DELETE both allowed, unchanged behaviour
--   sealed = true   -> UPDATE blocked entirely; DELETE blocked entirely
--
-- Note on "DELETE": the application never physically deletes a Memorial —
-- see app/api/memorial/[memorialId]/route.ts's DELETE handler, which
-- archives (status = ARCHIVED) rather than removing the row. The DELETE
-- trigger here is a safety net against a direct SQL DELETE or a future
-- code path that tries to physically delete a sealed row — it has no
-- effect on the existing archive-based "delete" the app already uses,
-- since that's an UPDATE (to status), not a DELETE statement, and only
-- fires the UPDATE trigger, which only blocks changes to a SEALED row
-- (archiving an unsealed memorial is unaffected).
--
-- Memory rows are additionally protected from physical deletion by the
-- existing `onDelete: Restrict` foreign key from Memory to Memorial
-- (see schema.prisma) — that FK already prevents deleting a Memorial
-- that still has Memory rows. This migration adds the equivalent
-- protection for Memory rows themselves (sealed memories can't be
-- deleted, regardless of the parent Memorial's state) and the seal-aware
-- UPDATE protection on both tables, which the FK constraint alone
-- doesn't provide.

-- ── Function: block UPDATE on a sealed memorial ────────────────────────
CREATE OR REPLACE FUNCTION prevent_sealed_memorial_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.sealed = true THEN
    RAISE EXCEPTION 'Memorial % is sealed and cannot be modified', OLD.id
      USING ERRCODE = '23514'; -- check_violation
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Function: block DELETE on a sealed memorial ────────────────────────
CREATE OR REPLACE FUNCTION prevent_memorial_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.sealed = true THEN
    RAISE EXCEPTION 'Memorial % is sealed and cannot be deleted', OLD.id
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ── Function: block UPDATE on a sealed memory ──────────────────────────
CREATE OR REPLACE FUNCTION prevent_sealed_memory_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.sealed = true THEN
    RAISE EXCEPTION 'Memory % is sealed and cannot be modified', OLD.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Function: block DELETE on a sealed memory ──────────────────────────
CREATE OR REPLACE FUNCTION prevent_memory_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.sealed = true THEN
    RAISE EXCEPTION 'Memory % is sealed and cannot be deleted', OLD.id
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ── Triggers — drop-and-recreate is idempotent-safe for a fresh
--    migration; `IF NOT EXISTS` isn't supported for CREATE TRIGGER in
--    Postgres, so DROP IF EXISTS + CREATE is the standard safe pattern.

DROP TRIGGER IF EXISTS trigger_prevent_sealed_memorial_update ON "memorials";
CREATE TRIGGER trigger_prevent_sealed_memorial_update
  BEFORE UPDATE ON "memorials"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_sealed_memorial_update();

DROP TRIGGER IF EXISTS trigger_prevent_memorial_delete ON "memorials";
CREATE TRIGGER trigger_prevent_memorial_delete
  BEFORE DELETE ON "memorials"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_memorial_delete();

DROP TRIGGER IF EXISTS trigger_prevent_sealed_memory_update ON "memories";
CREATE TRIGGER trigger_prevent_sealed_memory_update
  BEFORE UPDATE ON "memories"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_sealed_memory_update();

DROP TRIGGER IF EXISTS trigger_prevent_memory_delete ON "memories";
CREATE TRIGGER trigger_prevent_memory_delete
  BEFORE DELETE ON "memories"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_memory_delete();

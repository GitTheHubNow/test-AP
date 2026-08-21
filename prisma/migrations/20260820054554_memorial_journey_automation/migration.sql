-- Memorial journey automation (see lib/memorial/journeyGate.ts)
--
-- Adds:
--   nominatedName          — optional display name for the family/nominated
--                             contact, used to personalise automated emails.
--                             Sits alongside the existing nominatedEmail field.
--   tributeUnlockOverride  — manual early-unlock for the Tribute Video
--                             section (normally opens 5 days before
--                             funeralDate). Lets staff open it early, e.g.
--                             a family arrives with a USB stick of photos
--                             ready to go on day one.
--   lastChanceEmailSentAt  — one-shot guard so the "last chance to upload"
--                             reminder (fires ~5 days before the service)
--                             never sends twice for the same memorial.
--   publishPromptSentAt    — one-shot guard so the "ready to publish"
--                             reminder (fires the day before the service)
--                             never sends twice for the same memorial.
--
-- All four are additive, nullable or defaulted — safe on existing rows,
-- no backfill needed.
--
-- NOTE: table is "memorials" (lowercase, plural) per @@map("memorials")
-- on the Memorial model — NOT "Memorial". First attempt at this migration
-- used the bare model name and failed with 42P01 (relation does not
-- exist) because of this.

-- AlterTable
ALTER TABLE "memorials" ADD COLUMN     "nominatedName" TEXT,
ADD COLUMN     "tributeUnlockOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastChanceEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "publishPromptSentAt" TIMESTAMP(3);

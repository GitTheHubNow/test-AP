-- Split FuneralCase.venue (single free-text field) into venueName +
-- venueAddress, matching the richer format Memorial already used.
-- See lib/memorial/resolveMemorialFields.ts — this is the schema half
-- of "Memorial reads through FuneralCase for linked memorials, no
-- duplicate/diverging venue data" (Priority 3 from the product
-- roadmap).
--
-- venue is kept (deprecated, not dropped) for backward compatibility
-- with any code still reading it directly. venueName/venueAddress
-- start NULL on existing rows — no automatic re-split of the old
-- free-text venue string is attempted here, since "123 Smith St,
-- Anytown" -> name vs address isn't reliably parseable. Existing case
-- rows keep displaying via the old `venue` field until a funeral home
-- staff member re-saves the case detail form with the new split
-- fields (the case detail UI update, in the same delivery as this
-- migration, prompts for both).

-- AlterTable
ALTER TABLE "funeral_cases" ADD COLUMN "venueName" TEXT,
ADD COLUMN "venueAddress" TEXT;

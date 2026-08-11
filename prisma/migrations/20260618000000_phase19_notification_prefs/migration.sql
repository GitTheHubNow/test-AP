-- prisma/migrations/20260618000000_phase19_notification_prefs/migration.sql
-- (This file was previously misfiled under the phase18 folder — moved here
--  during the pre-launch audit fix. No SQL content changed.)
--
-- Phase 19: Notification preferences per organisation.
-- Additive — one nullable JSON column, default null = use platform defaults.
-- No existing rows are affected.
--
-- Rollback: ALTER TABLE "organisations" DROP COLUMN IF EXISTS "notificationPrefs";

ALTER TABLE "organisations"
  ADD COLUMN "notificationPrefs" JSONB;

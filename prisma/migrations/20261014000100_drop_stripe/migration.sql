-- DESTRUCTIVE: removes every Stripe column and table. Irreversible without
-- a backup. Nothing in the application reads these any more (see the
-- manual-billing change). If you want to keep the old Stripe IDs for
-- reference, export them BEFORE deploying, e.g.:
--   \copy (SELECT id, name, "stripeCustomerId", "stripeSubId" FROM organisations
--          WHERE "stripeCustomerId" IS NOT NULL) TO 'stripe_ids.csv' CSV HEADER
-- Dropping a column also drops the indexes that were defined on it.

-- DropTable
DROP TABLE "stripe_events";

-- DropTable
DROP TABLE "stripe_customers";

-- AlterTable: organisations — Stripe state, plus the monthly counters
-- that only existed to feed Stripe metered reporting (the usage_events
-- ledger is now the single source of truth).
ALTER TABLE "organisations"
  DROP COLUMN "stripeCustomerId",
  DROP COLUMN "stripeSubId",
  DROP COLUMN "stripePriceId",
  DROP COLUMN "currentPeriodEnd",
  DROP COLUMN "cancelAtPeriodEnd",
  DROP COLUMN "meteredItemId",
  DROP COLUMN "memorialsThisMonth",
  DROP COLUMN "videosThisMonth";

-- AlterTable: entitlements — per-memorial Stripe columns (never read)
ALTER TABLE "entitlements"
  DROP COLUMN "stripeSubId",
  DROP COLUMN "subscriptionPriceId",
  DROP COLUMN "storageCheckoutId";

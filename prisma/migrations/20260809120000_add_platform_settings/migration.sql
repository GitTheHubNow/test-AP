-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "trialDays" INTEGER NOT NULL DEFAULT 30,
    "promoActive" BOOLEAN NOT NULL DEFAULT false,
    "promoLabel" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- Seed the single row this table will ever have. The app always reads/
-- writes the row with id = 'singleton' — there is intentionally no
-- create-a-new-row path anywhere in the API, since this table represents
-- one global setting, not a list.
INSERT INTO "platform_settings" ("id", "trialDays", "promoActive", "updatedAt")
VALUES ('singleton', 30, false, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

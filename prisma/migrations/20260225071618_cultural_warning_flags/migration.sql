/*
  Warnings:

  - You are about to drop the column `expiresAt` on the `entitlements` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE');

-- AlterTable
ALTER TABLE "entitlements" DROP COLUMN "expiresAt",
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "storageCheckoutId" TEXT,
ADD COLUMN     "storageExpiresAt" TIMESTAMP(3),
ADD COLUMN     "storagePaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "storagePaidAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionPriceId" TEXT,
ADD COLUMN     "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "memorials" ADD COLUMN     "isAboriginal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isMaori" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSouthSeaIslander" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isTorresStraitIslander" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "stripe_customers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stripe_customers_userId_key" ON "stripe_customers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_customers_stripeCustomerId_key" ON "stripe_customers"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "stripe_customers_userId_idx" ON "stripe_customers"("userId");

-- CreateIndex
CREATE INDEX "stripe_customers_stripeCustomerId_idx" ON "stripe_customers"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "entitlements_storagePaid_idx" ON "entitlements"("storagePaid");

-- CreateIndex
CREATE INDEX "entitlements_storageExpiresAt_idx" ON "entitlements"("storageExpiresAt");

-- CreateIndex
CREATE INDEX "memorials_expiresAt_idx" ON "memorials"("expiresAt");

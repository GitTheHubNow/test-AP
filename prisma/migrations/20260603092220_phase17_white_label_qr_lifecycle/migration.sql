/*
  Warnings:

  - A unique constraint covering the columns `[publicToken]` on the table `memorials` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ProductRequestStatus" AS ENUM ('REQUESTED', 'QUOTED', 'APPROVED', 'FULFILLED', 'CANCELLED');

-- AlterTable
ALTER TABLE "memorials" ADD COLUMN     "pamphletEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pamphletMessage" TEXT,
ADD COLUMN     "pamphletTitle" TEXT,
ADD COLUMN     "pamphletVenueNote" TEXT,
ADD COLUMN     "publicToken" TEXT,
ADD COLUMN     "qrState" TEXT NOT NULL DEFAULT 'MEMORIAL_OPEN',
ADD COLUMN     "serviceStartAt" TIMESTAMP(3),
ADD COLUMN     "unlockAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "organisations" ADD COLUMN     "brandName" TEXT,
ADD COLUMN     "defaultUnlockDelayHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "featurePamphlet" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "featureProducts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "featureQrLifecycle" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "featureSlideshow" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isWhiteLabelEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "poweredByEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "primaryColor" TEXT,
ADD COLUMN     "secondaryColor" TEXT,
ADD COLUMN     "supportEmail" TEXT;

-- CreateTable
CREATE TABLE "product_requests" (
    "id" TEXT NOT NULL,
    "memorialId" TEXT NOT NULL,
    "organisationId" TEXT,
    "productType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "specifications" JSONB,
    "status" "ProductRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "quotedPrice" DOUBLE PRECISION,
    "requestNotes" TEXT,
    "productionNotes" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quotedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "product_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_requests_memorialId_idx" ON "product_requests"("memorialId");

-- CreateIndex
CREATE INDEX "product_requests_organisationId_idx" ON "product_requests"("organisationId");

-- CreateIndex
CREATE INDEX "product_requests_status_idx" ON "product_requests"("status");

-- CreateIndex
CREATE INDEX "product_requests_requestedAt_idx" ON "product_requests"("requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "memorials_publicToken_key" ON "memorials"("publicToken");

-- CreateIndex
CREATE INDEX "memorials_publicToken_idx" ON "memorials"("publicToken");

-- CreateIndex
CREATE INDEX "memorials_qrState_idx" ON "memorials"("qrState");

-- CreateIndex
CREATE INDEX "memorials_unlockAt_idx" ON "memorials"("unlockAt");

-- AddForeignKey
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_memorialId_fkey" FOREIGN KEY ("memorialId") REFERENCES "memorials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

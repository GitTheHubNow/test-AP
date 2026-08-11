-- CreateEnum
CREATE TYPE "MemorialStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MemoryStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EntitlementTier" AS ENUM ('FREE', 'BASIC', 'PREMIUM');

-- CreateTable
CREATE TABLE "memorials" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "qrTokenHash" TEXT NOT NULL,
    "contentHash" TEXT,
    "status" "MemorialStatus" NOT NULL DEFAULT 'ACTIVE',
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "sealed" BOOLEAN NOT NULL DEFAULT false,
    "sealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "memorials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memories" (
    "id" TEXT NOT NULL,
    "memorialId" TEXT NOT NULL,
    "authorName" TEXT,
    "message" TEXT NOT NULL,
    "contentHash" TEXT,
    "status" "MemoryStatus" NOT NULL DEFAULT 'PENDING',
    "sealed" BOOLEAN NOT NULL DEFAULT false,
    "sealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rejectedAt" TIMESTAMP(3),

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "memorialId" TEXT NOT NULL,
    "memoryId" TEXT,
    "blobKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rejectedAt" TIMESTAMP(3),

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" TEXT NOT NULL,
    "memorialId" TEXT NOT NULL,
    "stripeSubId" TEXT,
    "tier" "EntitlementTier" NOT NULL DEFAULT 'FREE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "memorials_qrTokenHash_key" ON "memorials"("qrTokenHash");

-- CreateIndex
CREATE INDEX "memorials_ownerId_idx" ON "memorials"("ownerId");

-- CreateIndex
CREATE INDEX "memorials_qrTokenHash_idx" ON "memorials"("qrTokenHash");

-- CreateIndex
CREATE INDEX "memorials_status_idx" ON "memorials"("status");

-- CreateIndex
CREATE INDEX "memorials_createdAt_idx" ON "memorials"("createdAt");

-- CreateIndex
CREATE INDEX "memorials_sealed_idx" ON "memorials"("sealed");

-- CreateIndex
CREATE INDEX "memories_memorialId_idx" ON "memories"("memorialId");

-- CreateIndex
CREATE INDEX "memories_status_idx" ON "memories"("status");

-- CreateIndex
CREATE INDEX "memories_createdAt_idx" ON "memories"("createdAt");

-- CreateIndex
CREATE INDEX "memories_sealed_idx" ON "memories"("sealed");

-- CreateIndex
CREATE INDEX "media_memorialId_idx" ON "media"("memorialId");

-- CreateIndex
CREATE INDEX "media_memoryId_idx" ON "media"("memoryId");

-- CreateIndex
CREATE INDEX "media_status_idx" ON "media"("status");

-- CreateIndex
CREATE INDEX "media_createdAt_idx" ON "media"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_memorialId_key" ON "entitlements"("memorialId");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_stripeSubId_key" ON "entitlements"("stripeSubId");

-- CreateIndex
CREATE INDEX "entitlements_memorialId_idx" ON "entitlements"("memorialId");

-- CreateIndex
CREATE INDEX "entitlements_stripeSubId_idx" ON "entitlements"("stripeSubId");

-- CreateIndex
CREATE INDEX "entitlements_active_idx" ON "entitlements"("active");

-- CreateIndex
CREATE INDEX "audit_events_entityId_idx" ON "audit_events"("entityId");

-- CreateIndex
CREATE INDEX "audit_events_timestamp_idx" ON "audit_events"("timestamp");

-- CreateIndex
CREATE INDEX "audit_events_entityType_entityId_idx" ON "audit_events"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_memorialId_fkey" FOREIGN KEY ("memorialId") REFERENCES "memorials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_memorialId_fkey" FOREIGN KEY ("memorialId") REFERENCES "memorials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "memories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_memorialId_fkey" FOREIGN KEY ("memorialId") REFERENCES "memorials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

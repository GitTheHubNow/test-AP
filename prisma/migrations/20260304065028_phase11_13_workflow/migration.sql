-- CreateEnum
CREATE TYPE "CollectionItemStatus" AS ENUM ('UNSORTED', 'READY', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CollectionItemType" AS ENUM ('PHOTO', 'VIDEO', 'STORY', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "CollectionInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "HandoverStatus" AS ENUM ('PENDING', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "memorials" ADD COLUMN     "collectionNotes" TEXT,
ADD COLUMN     "funeralDate" TIMESTAMP(3),
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "workflowStage" TEXT NOT NULL DEFAULT 'COLLECTING';

-- AlterTable
ALTER TABLE "memories" ADD COLUMN     "collectionItemId" TEXT;

-- CreateTable
CREATE TABLE "collection_items" (
    "id" TEXT NOT NULL,
    "memorialId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploaderRole" TEXT NOT NULL,
    "inviteId" TEXT,
    "type" "CollectionItemType" NOT NULL,
    "status" "CollectionItemStatus" NOT NULL DEFAULT 'UNSORTED',
    "title" TEXT,
    "description" TEXT,
    "category" "MemoryCategory",
    "blobKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "showPublicly" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER,
    "promotedMemoryId" TEXT,
    "rejectionReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_invites" (
    "id" TEXT NOT NULL,
    "memorialId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "status" "CollectionInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "uploadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preview_sessions" (
    "id" TEXT NOT NULL,
    "memorialId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "viewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preview_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memorial_handovers" (
    "id" TEXT NOT NULL,
    "memorialId" TEXT NOT NULL,
    "initiatedBy" TEXT NOT NULL,
    "status" "HandoverStatus" NOT NULL DEFAULT 'PENDING',
    "familyContactName" TEXT NOT NULL,
    "familyContactEmail" TEXT NOT NULL,
    "familyContactPhone" TEXT,
    "familyClerkUserId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "acceptToken" TEXT,
    "acceptTokenExpiresAt" TIMESTAMP(3),
    "notificationSentAt" TIMESTAMP(3),
    "previousOwnerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memorial_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collection_items_memorialId_idx" ON "collection_items"("memorialId");

-- CreateIndex
CREATE INDEX "collection_items_memorialId_status_idx" ON "collection_items"("memorialId", "status");

-- CreateIndex
CREATE INDEX "collection_items_memorialId_type_idx" ON "collection_items"("memorialId", "type");

-- CreateIndex
CREATE INDEX "collection_items_uploadedBy_idx" ON "collection_items"("uploadedBy");

-- CreateIndex
CREATE INDEX "collection_items_inviteId_idx" ON "collection_items"("inviteId");

-- CreateIndex
CREATE INDEX "collection_items_promotedMemoryId_idx" ON "collection_items"("promotedMemoryId");

-- CreateIndex
CREATE UNIQUE INDEX "collection_invites_token_key" ON "collection_invites"("token");

-- CreateIndex
CREATE INDEX "collection_invites_memorialId_idx" ON "collection_invites"("memorialId");

-- CreateIndex
CREATE INDEX "collection_invites_token_idx" ON "collection_invites"("token");

-- CreateIndex
CREATE INDEX "collection_invites_status_idx" ON "collection_invites"("status");

-- CreateIndex
CREATE INDEX "collection_invites_expiresAt_idx" ON "collection_invites"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "preview_sessions_token_key" ON "preview_sessions"("token");

-- CreateIndex
CREATE INDEX "preview_sessions_memorialId_idx" ON "preview_sessions"("memorialId");

-- CreateIndex
CREATE INDEX "preview_sessions_token_idx" ON "preview_sessions"("token");

-- CreateIndex
CREATE INDEX "preview_sessions_expiresAt_idx" ON "preview_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "memorial_handovers_memorialId_key" ON "memorial_handovers"("memorialId");

-- CreateIndex
CREATE UNIQUE INDEX "memorial_handovers_acceptToken_key" ON "memorial_handovers"("acceptToken");

-- CreateIndex
CREATE INDEX "memorial_handovers_memorialId_idx" ON "memorial_handovers"("memorialId");

-- CreateIndex
CREATE INDEX "memorial_handovers_status_idx" ON "memorial_handovers"("status");

-- CreateIndex
CREATE INDEX "memorial_handovers_scheduledAt_idx" ON "memorial_handovers"("scheduledAt");

-- CreateIndex
CREATE INDEX "memorial_handovers_acceptToken_idx" ON "memorial_handovers"("acceptToken");

-- CreateIndex
CREATE INDEX "memorials_workflowStage_idx" ON "memorials"("workflowStage");

-- CreateIndex
CREATE INDEX "memories_collectionItemId_idx" ON "memories"("collectionItemId");

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_collectionItemId_fkey" FOREIGN KEY ("collectionItemId") REFERENCES "collection_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_memorialId_fkey" FOREIGN KEY ("memorialId") REFERENCES "memorials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "collection_invites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_invites" ADD CONSTRAINT "collection_invites_memorialId_fkey" FOREIGN KEY ("memorialId") REFERENCES "memorials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preview_sessions" ADD CONSTRAINT "preview_sessions_memorialId_fkey" FOREIGN KEY ("memorialId") REFERENCES "memorials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memorial_handovers" ADD CONSTRAINT "memorial_handovers_memorialId_fkey" FOREIGN KEY ("memorialId") REFERENCES "memorials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

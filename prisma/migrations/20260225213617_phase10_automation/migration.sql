-- AlterTable
ALTER TABLE "memorials" ADD COLUMN     "autoSentAt" TIMESTAMP(3),
ADD COLUMN     "expiryWarningSentAt" TIMESTAMP(3),
ADD COLUMN     "nominatedEmail" TEXT;

-- AlterTable
ALTER TABLE "memories" ADD COLUMN     "stale" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "memorials_autoSentAt_idx" ON "memorials"("autoSentAt");

-- CreateIndex
CREATE INDEX "memorials_sendAfterDays_idx" ON "memorials"("sendAfterDays");

-- CreateIndex
CREATE INDEX "memories_status_createdAt_idx" ON "memories"("status", "createdAt");

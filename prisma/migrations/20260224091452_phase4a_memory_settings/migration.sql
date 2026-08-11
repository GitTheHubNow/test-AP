-- CreateEnum
CREATE TYPE "MemoryCategory" AS ENUM ('GENERAL', 'CONDOLENCE', 'STORY', 'TRIBUTE', 'GUEST_BOOK');

-- AlterTable
ALTER TABLE "memorials" ADD COLUMN     "sendAfterDays" INTEGER;

-- AlterTable
ALTER TABLE "memories" ADD COLUMN     "category" "MemoryCategory" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isGuestBook" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "visibleUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "memorial_settings" (
    "id" TEXT NOT NULL,
    "memorialId" TEXT NOT NULL,
    "primaryColor" TEXT,
    "backgroundColor" TEXT,
    "fontFamily" TEXT,
    "showTimeline" BOOLEAN NOT NULL DEFAULT true,
    "showGallery" BOOLEAN NOT NULL DEFAULT true,
    "showGuestBook" BOOLEAN NOT NULL DEFAULT true,
    "showMemoryCount" BOOLEAN NOT NULL DEFAULT true,
    "guestBookTitle" TEXT,
    "guestBookPrompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memorial_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "memorial_settings_memorialId_key" ON "memorial_settings"("memorialId");

-- CreateIndex
CREATE INDEX "memorial_settings_memorialId_idx" ON "memorial_settings"("memorialId");

-- CreateIndex
CREATE INDEX "memories_memorialId_isGuestBook_idx" ON "memories"("memorialId", "isGuestBook");

-- CreateIndex
CREATE INDEX "memories_memorialId_featured_idx" ON "memories"("memorialId", "featured");

-- CreateIndex
CREATE INDEX "memories_memorialId_category_idx" ON "memories"("memorialId", "category");

-- AddForeignKey
ALTER TABLE "memorial_settings" ADD CONSTRAINT "memorial_settings_memorialId_fkey" FOREIGN KEY ("memorialId") REFERENCES "memorials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

/*
  Warnings:

  - A unique constraint covering the columns `[uploadLinkToken]` on the table `memorials` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('DRAFT', 'RENDERING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "VideoTheme" AS ENUM ('CLASSIC', 'MODERN', 'RUSTIC', 'CELEBRATION');

-- CreateEnum
CREATE TYPE "MusicCategory" AS ENUM ('PEACEFUL', 'UPLIFTING', 'CLASSICAL', 'HYMN', 'INSTRUMENTAL', 'CELEBRATION');

-- CreateEnum
CREATE TYPE "GuestBookStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "collection_items" ADD COLUMN     "caption" TEXT,
ADD COLUMN     "forMemorial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "forTribute" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isHero" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tributeDuration" DOUBLE PRECISION,
ADD COLUMN     "tributeOrder" INTEGER,
ADD COLUMN     "uploaderEmail" TEXT,
ADD COLUMN     "uploaderName" TEXT;

-- AlterTable
ALTER TABLE "memorials" ADD COLUMN     "familyContactEmail" TEXT,
ADD COLUMN     "familyContactName" TEXT,
ADD COLUMN     "familyContactPhone" TEXT,
ADD COLUMN     "heroImageKey" TEXT,
ADD COLUMN     "placeOfPassing" TEXT,
ADD COLUMN     "preferredName" TEXT,
ADD COLUMN     "serviceTime" TIMESTAMP(3),
ADD COLUMN     "serviceType" TEXT,
ADD COLUMN     "uploadLinkEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "uploadLinkToken" TEXT,
ADD COLUMN     "venueAddress" TEXT,
ADD COLUMN     "venueName" TEXT;

-- CreateTable
CREATE TABLE "tribute_videos" (
    "id" TEXT NOT NULL,
    "memorialId" TEXT NOT NULL,
    "status" "VideoStatus" NOT NULL DEFAULT 'DRAFT',
    "theme" "VideoTheme" NOT NULL DEFAULT 'CLASSIC',
    "musicTrackId" TEXT,
    "customMusicKey" TEXT,
    "photoOrder" JSONB NOT NULL DEFAULT '[]',
    "titleCardText" TEXT,
    "endCardText" TEXT,
    "durationSeconds" INTEGER,
    "hdBlobKey" TEXT,
    "webBlobKey" TEXT,
    "videoQrToken" TEXT,
    "showOnMemorial" BOOLEAN NOT NULL DEFAULT false,
    "renderedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tribute_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_tracks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "category" "MusicCategory" NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "blobKey" TEXT NOT NULL,
    "previewBlobKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "music_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_book_entries" (
    "id" TEXT NOT NULL,
    "memorialId" TEXT NOT NULL,
    "authorName" TEXT,
    "message" TEXT NOT NULL,
    "location" TEXT,
    "photoKey" TEXT,
    "status" "GuestBookStatus" NOT NULL DEFAULT 'PENDING',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "ipHash" TEXT,
    "flaggedByFilter" BOOLEAN NOT NULL DEFAULT false,
    "filterReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_book_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tribute_videos_memorialId_key" ON "tribute_videos"("memorialId");

-- CreateIndex
CREATE UNIQUE INDEX "tribute_videos_videoQrToken_key" ON "tribute_videos"("videoQrToken");

-- CreateIndex
CREATE INDEX "tribute_videos_memorialId_idx" ON "tribute_videos"("memorialId");

-- CreateIndex
CREATE INDEX "tribute_videos_status_idx" ON "tribute_videos"("status");

-- CreateIndex
CREATE INDEX "tribute_videos_videoQrToken_idx" ON "tribute_videos"("videoQrToken");

-- CreateIndex
CREATE INDEX "music_tracks_category_idx" ON "music_tracks"("category");

-- CreateIndex
CREATE INDEX "music_tracks_active_idx" ON "music_tracks"("active");

-- CreateIndex
CREATE INDEX "guest_book_entries_memorialId_idx" ON "guest_book_entries"("memorialId");

-- CreateIndex
CREATE INDEX "guest_book_entries_memorialId_status_idx" ON "guest_book_entries"("memorialId", "status");

-- CreateIndex
CREATE INDEX "guest_book_entries_memorialId_pinned_idx" ON "guest_book_entries"("memorialId", "pinned");

-- CreateIndex
CREATE INDEX "guest_book_entries_createdAt_idx" ON "guest_book_entries"("createdAt");

-- CreateIndex
CREATE INDEX "guest_book_entries_ipHash_idx" ON "guest_book_entries"("ipHash");

-- CreateIndex
CREATE INDEX "collection_items_memorialId_forTribute_idx" ON "collection_items"("memorialId", "forTribute");

-- CreateIndex
CREATE INDEX "collection_items_memorialId_forMemorial_idx" ON "collection_items"("memorialId", "forMemorial");

-- CreateIndex
CREATE INDEX "collection_items_memorialId_isHero_idx" ON "collection_items"("memorialId", "isHero");

-- CreateIndex
CREATE UNIQUE INDEX "memorials_uploadLinkToken_key" ON "memorials"("uploadLinkToken");

-- CreateIndex
CREATE INDEX "memorials_uploadLinkToken_idx" ON "memorials"("uploadLinkToken");

-- AddForeignKey
ALTER TABLE "tribute_videos" ADD CONSTRAINT "tribute_videos_memorialId_fkey" FOREIGN KEY ("memorialId") REFERENCES "memorials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tribute_videos" ADD CONSTRAINT "tribute_videos_musicTrackId_fkey" FOREIGN KEY ("musicTrackId") REFERENCES "music_tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_book_entries" ADD CONSTRAINT "guest_book_entries_memorialId_fkey" FOREIGN KEY ("memorialId") REFERENCES "memorials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

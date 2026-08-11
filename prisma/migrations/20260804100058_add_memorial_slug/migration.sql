-- AlterTable
ALTER TABLE "memorials" ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE INDEX "memorials_slug_idx" ON "memorials"("slug");

-- CreateTable
CREATE TABLE "page_views" (
    "id" TEXT NOT NULL,
    "memorialId" TEXT NOT NULL,
    "visitorToken" TEXT NOT NULL,
    "referrer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_views_memorialId_idx" ON "page_views"("memorialId");

-- CreateIndex
CREATE INDEX "page_views_memorialId_createdAt_idx" ON "page_views"("memorialId", "createdAt");

-- CreateIndex
CREATE INDEX "page_views_visitorToken_idx" ON "page_views"("visitorToken");

-- AddForeignKey
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_memorialId_fkey" FOREIGN KEY ("memorialId") REFERENCES "memorials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

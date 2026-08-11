-- CreateTable
CREATE TABLE "reactions" (
    "id" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "visitorToken" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reactions_memoryId_idx" ON "reactions"("memoryId");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_memoryId_visitorToken_emoji_key" ON "reactions"("memoryId", "visitorToken", "emoji");

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "memories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

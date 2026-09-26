-- AlterTable: memorial_handovers — family self-service access token,
-- separate and independent from the existing one-time acceptToken flow.
ALTER TABLE "memorial_handovers" ADD COLUMN "familyAccessToken" TEXT;
ALTER TABLE "memorial_handovers" ADD COLUMN "familyAccessEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "memorial_handovers" ADD COLUMN "familyAccessRevokedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "memorial_handovers_familyAccessToken_key" ON "memorial_handovers"("familyAccessToken");
CREATE INDEX "memorial_handovers_familyAccessToken_idx" ON "memorial_handovers"("familyAccessToken");

-- AlterTable: memories and guest_book_entries — family display-hide flag,
-- independent of each table's existing moderation status column.
ALTER TABLE "memories" ADD COLUMN "familyHidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "guest_book_entries" ADD COLUMN "familyHidden" BOOLEAN NOT NULL DEFAULT false;

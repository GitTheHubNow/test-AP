-- AlterTable
ALTER TABLE "memorial_settings" ADD COLUMN     "heroLayout" TEXT NOT NULL DEFAULT 'full-bleed',
ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'light';

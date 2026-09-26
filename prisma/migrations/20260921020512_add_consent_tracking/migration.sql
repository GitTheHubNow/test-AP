-- AlterTable: organisations — signup-time Terms/Privacy consent
ALTER TABLE "organisations" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "organisations" ADD COLUMN "termsAcceptedVersion" TEXT;
ALTER TABLE "organisations" ADD COLUMN "termsAcceptedByUserId" TEXT;

-- AlterTable: memorials — per-memorial family-consent-to-publish attestation
ALTER TABLE "memorials" ADD COLUMN "familyConsentConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "memorials" ADD COLUMN "familyConsentConfirmedAt" TIMESTAMP(3);
ALTER TABLE "memorials" ADD COLUMN "familyConsentConfirmedByUserId" TEXT;

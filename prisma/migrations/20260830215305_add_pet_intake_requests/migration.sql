/*
  Warnings:

  - A unique constraint covering the columns `[petIntakeToken]` on the table `organisations` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PetIntakeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "organisations" ADD COLUMN     "petIntakeToken" TEXT;

-- CreateTable
CREATE TABLE "pet_intake_requests" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "submittedBy" "PetIntakeSource" NOT NULL,
    "petName" TEXT NOT NULL,
    "species" TEXT,
    "breed" TEXT,
    "ownerContactName" TEXT NOT NULL,
    "ownerContactEmail" TEXT,
    "ownerContactPhone" TEXT,
    "vetClinicName" TEXT,
    "vetContactName" TEXT,
    "vetContactEmail" TEXT,
    "vetContactPhone" TEXT,
    "serviceType" TEXT,
    "notes" TEXT,
    "status" "PetIntakeStatus" NOT NULL DEFAULT 'PENDING',
    "resultingPetCaseId" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_intake_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pet_intake_requests_resultingPetCaseId_key" ON "pet_intake_requests"("resultingPetCaseId");

-- CreateIndex
CREATE INDEX "pet_intake_requests_organisationId_idx" ON "pet_intake_requests"("organisationId");

-- CreateIndex
CREATE INDEX "pet_intake_requests_organisationId_status_idx" ON "pet_intake_requests"("organisationId", "status");

-- CreateIndex
CREATE INDEX "pet_intake_requests_ipHash_idx" ON "pet_intake_requests"("ipHash");

-- CreateIndex
CREATE INDEX "pet_intake_requests_createdAt_idx" ON "pet_intake_requests"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "organisations_petIntakeToken_key" ON "organisations"("petIntakeToken");

-- AddForeignKey
ALTER TABLE "pet_intake_requests" ADD CONSTRAINT "pet_intake_requests_resultingPetCaseId_fkey" FOREIGN KEY ("resultingPetCaseId") REFERENCES "pet_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_intake_requests" ADD CONSTRAINT "pet_intake_requests_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

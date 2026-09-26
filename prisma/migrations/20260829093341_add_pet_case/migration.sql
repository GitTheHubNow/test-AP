-- CreateEnum
CREATE TYPE "PetCaseStage" AS ENUM ('INTAKE', 'RECEIVED', 'IN_CARE', 'READY', 'RETURNED');

-- CreateEnum
CREATE TYPE "PetIntakeSource" AS ENUM ('VET', 'OWNER', 'WALK_IN');

-- AlterTable
ALTER TABLE "organisations" ADD COLUMN     "featurePetAftercare" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "pet_cases" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "caseRef" TEXT NOT NULL,
    "petName" TEXT NOT NULL,
    "species" TEXT,
    "breed" TEXT,
    "ownerContactName" TEXT NOT NULL,
    "ownerContactEmail" TEXT,
    "ownerContactPhone" TEXT,
    "intakeSource" "PetIntakeSource" NOT NULL DEFAULT 'OWNER',
    "vetClinicName" TEXT,
    "vetContactName" TEXT,
    "vetContactEmail" TEXT,
    "vetContactPhone" TEXT,
    "stage" "PetCaseStage" NOT NULL DEFAULT 'INTAKE',
    "serviceType" TEXT,
    "notes" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "qrTokenHash" TEXT,
    "trackerToken" TEXT,
    "memorialId" TEXT,
    "collectedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_case_stage_events" (
    "id" TEXT NOT NULL,
    "petCaseId" TEXT NOT NULL,
    "stage" "PetCaseStage" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "pet_case_stage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pet_cases_qrTokenHash_key" ON "pet_cases"("qrTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "pet_cases_trackerToken_key" ON "pet_cases"("trackerToken");

-- CreateIndex
CREATE UNIQUE INDEX "pet_cases_memorialId_key" ON "pet_cases"("memorialId");

-- CreateIndex
CREATE INDEX "pet_cases_organisationId_idx" ON "pet_cases"("organisationId");

-- CreateIndex
CREATE INDEX "pet_cases_organisationId_status_idx" ON "pet_cases"("organisationId", "status");

-- CreateIndex
CREATE INDEX "pet_cases_organisationId_stage_idx" ON "pet_cases"("organisationId", "stage");

-- CreateIndex
CREATE INDEX "pet_cases_memorialId_idx" ON "pet_cases"("memorialId");

-- CreateIndex
CREATE INDEX "pet_cases_qrTokenHash_idx" ON "pet_cases"("qrTokenHash");

-- CreateIndex
CREATE INDEX "pet_cases_trackerToken_idx" ON "pet_cases"("trackerToken");

-- CreateIndex
CREATE UNIQUE INDEX "pet_cases_organisationId_caseRef_key" ON "pet_cases"("organisationId", "caseRef");

-- CreateIndex
CREATE INDEX "pet_case_stage_events_petCaseId_idx" ON "pet_case_stage_events"("petCaseId");

-- AddForeignKey
ALTER TABLE "pet_cases" ADD CONSTRAINT "pet_cases_memorialId_fkey" FOREIGN KEY ("memorialId") REFERENCES "memorials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_cases" ADD CONSTRAINT "pet_cases_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_case_stage_events" ADD CONSTRAINT "pet_case_stage_events_petCaseId_fkey" FOREIGN KEY ("petCaseId") REFERENCES "pet_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

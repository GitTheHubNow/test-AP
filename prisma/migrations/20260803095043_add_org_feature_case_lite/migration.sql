-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "organisations" ADD COLUMN     "featureCaseLite" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "funeral_cases" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "caseRef" TEXT NOT NULL,
    "deceasedName" TEXT NOT NULL,
    "familyContact" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "serviceDate" TIMESTAMP(3),
    "venue" TEXT,
    "notes" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "memorialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funeral_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_hits" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "funeral_cases_memorialId_key" ON "funeral_cases"("memorialId");

-- CreateIndex
CREATE INDEX "funeral_cases_organisationId_idx" ON "funeral_cases"("organisationId");

-- CreateIndex
CREATE INDEX "funeral_cases_organisationId_status_idx" ON "funeral_cases"("organisationId", "status");

-- CreateIndex
CREATE INDEX "funeral_cases_serviceDate_idx" ON "funeral_cases"("serviceDate");

-- CreateIndex
CREATE INDEX "funeral_cases_memorialId_idx" ON "funeral_cases"("memorialId");

-- CreateIndex
CREATE UNIQUE INDEX "funeral_cases_organisationId_caseRef_key" ON "funeral_cases"("organisationId", "caseRef");

-- CreateIndex
CREATE INDEX "rate_limit_hits_bucket_ipHash_createdAt_idx" ON "rate_limit_hits"("bucket", "ipHash", "createdAt");

-- AddForeignKey
ALTER TABLE "funeral_cases" ADD CONSTRAINT "funeral_cases_memorialId_fkey" FOREIGN KEY ("memorialId") REFERENCES "memorials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funeral_cases" ADD CONSTRAINT "funeral_cases_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

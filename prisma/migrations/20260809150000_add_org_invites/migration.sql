-- CreateEnum
CREATE TYPE "OrgInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "org_invites" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "token" TEXT NOT NULL,
    "status" "OrgInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_invites_token_key" ON "org_invites"("token");

-- CreateIndex
CREATE INDEX "org_invites_organisationId_idx" ON "org_invites"("organisationId");

-- CreateIndex
CREATE INDEX "org_invites_token_idx" ON "org_invites"("token");

-- CreateIndex
CREATE INDEX "org_invites_email_idx" ON "org_invites"("email");

-- CreateIndex
CREATE INDEX "org_invites_status_idx" ON "org_invites"("status");

-- AddForeignKey
ALTER TABLE "org_invites" ADD CONSTRAINT "org_invites_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

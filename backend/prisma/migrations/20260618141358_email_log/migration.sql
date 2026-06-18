-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "to" TEXT[],
    "subject" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "senderEmail" TEXT,
    "messageId" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "versionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");

-- CreateIndex
CREATE INDEX "EmailLog_category_template_idx" ON "EmailLog"("category", "template");

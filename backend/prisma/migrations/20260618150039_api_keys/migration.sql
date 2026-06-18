-- CreateEnum
CREATE TYPE "ApiKeyScope" AS ENUM ('ALL', 'SELECTED');

-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN     "apiKeyId" TEXT,
ADD COLUMN     "apiKeyName" TEXT;

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "scope" "ApiKeyScope" NOT NULL DEFAULT 'SELECTED',
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKeyTemplate" (
    "apiKeyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "ApiKeyTemplate_pkey" PRIMARY KEY ("apiKeyId","templateId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");

-- AddForeignKey
ALTER TABLE "ApiKeyTemplate" ADD CONSTRAINT "ApiKeyTemplate_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKeyTemplate" ADD CONSTRAINT "ApiKeyTemplate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "SenderProvider" AS ENUM ('SES', 'RESEND');

-- AlterTable
ALTER TABLE "Sender" ADD COLUMN     "credentials" TEXT,
ADD COLUMN     "provider" "SenderProvider" NOT NULL DEFAULT 'SES';

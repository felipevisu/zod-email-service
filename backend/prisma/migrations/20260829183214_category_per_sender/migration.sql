-- Categories become per-sender; versions stop carrying their own sender.
-- Backfill: each category takes the sender most used by its templates'
-- versions, falling back to the oldest sender.

-- AlterTable (nullable first so existing rows can be backfilled)
ALTER TABLE "Category" ADD COLUMN "senderId" TEXT;

-- Backfill from version usage
UPDATE "Category" c
SET "senderId" = (
  SELECT v."senderId"
  FROM "Template" t
  JOIN "Version" v ON v."templateId" = t."id"
  WHERE t."categoryId" = c."id" AND v."senderId" IS NOT NULL
  GROUP BY v."senderId"
  ORDER BY COUNT(*) DESC
  LIMIT 1
);

-- Fallback: oldest sender for categories with no version usage
UPDATE "Category" c
SET "senderId" = (SELECT s."id" FROM "Sender" s ORDER BY s."createdAt" ASC LIMIT 1)
WHERE c."senderId" IS NULL;

ALTER TABLE "Category" ALTER COLUMN "senderId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "Version" DROP CONSTRAINT "Version_senderId_fkey";

-- AlterTable
ALTER TABLE "Version" DROP COLUMN "senderId";

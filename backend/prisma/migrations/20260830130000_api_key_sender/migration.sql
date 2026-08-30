-- Every API key belongs to one sender; the send URL's category slug is
-- resolved within that sender.
-- Backfill: each key takes the sender most used by its granted templates,
-- falling back to the oldest sender.

-- AlterTable (nullable first so existing rows can be backfilled)
ALTER TABLE "ApiKey" ADD COLUMN "senderId" TEXT;

-- Backfill from template grants
UPDATE "ApiKey" k
SET "senderId" = (
  SELECT c."senderId"
  FROM "ApiKeyTemplate" akt
  JOIN "Template" t ON t."id" = akt."templateId"
  JOIN "Category" c ON c."id" = t."categoryId"
  WHERE akt."apiKeyId" = k."id"
  GROUP BY c."senderId"
  ORDER BY COUNT(*) DESC
  LIMIT 1
);

-- Fallback: oldest sender for keys with no grants (ALL scope)
UPDATE "ApiKey" k
SET "senderId" = (SELECT s."id" FROM "Sender" s ORDER BY s."createdAt" ASC LIMIT 1)
WHERE k."senderId" IS NULL;

ALTER TABLE "ApiKey" ALTER COLUMN "senderId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

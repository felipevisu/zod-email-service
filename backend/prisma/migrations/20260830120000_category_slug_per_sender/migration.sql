-- Category slug uniqueness becomes per-sender instead of global.

-- DropIndex
DROP INDEX "Category_slug_key";

-- CreateIndex
CREATE UNIQUE INDEX "Category_senderId_slug_key" ON "Category"("senderId", "slug");

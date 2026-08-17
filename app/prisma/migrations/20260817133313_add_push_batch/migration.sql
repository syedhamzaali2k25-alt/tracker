-- CreateTable
CREATE TABLE "PushBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeCount" INTEGER NOT NULL,
    "entries" TEXT NOT NULL,
    "reverted" BOOLEAN NOT NULL DEFAULT false,
    "revertedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "PushBatch_shop_createdAt_idx" ON "PushBatch"("shop", "createdAt");

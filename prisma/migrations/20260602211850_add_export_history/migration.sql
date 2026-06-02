-- CreateTable
CREATE TABLE "ExportHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "productCount" INTEGER NOT NULL,
    "filtersJson" TEXT,
    "filtersLabel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ExportHistory_shop_createdAt_idx" ON "ExportHistory"("shop", "createdAt" DESC);

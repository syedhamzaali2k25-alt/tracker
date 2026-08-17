-- CreateTable
CREATE TABLE "GoogleAccount" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "refreshToken" TEXT,
    "spreadsheetId" TEXT,
    "updatedAt" DATETIME NOT NULL
);

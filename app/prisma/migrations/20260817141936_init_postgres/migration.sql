-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticCache" (
    "shop" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticCache_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "GoogleAccount" (
    "shop" TEXT NOT NULL,
    "refreshToken" TEXT,
    "spreadsheetId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleAccount_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "PushBatch" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeCount" INTEGER NOT NULL,
    "entries" TEXT NOT NULL,
    "reverted" BOOLEAN NOT NULL DEFAULT false,
    "revertedAt" TIMESTAMP(3),

    CONSTRAINT "PushBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PushBatch_shop_createdAt_idx" ON "PushBatch"("shop", "createdAt");

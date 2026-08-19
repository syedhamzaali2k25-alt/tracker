-- CreateTable
CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL,
    "emailAlerts" BOOLEAN NOT NULL DEFAULT true,
    "alertEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "WatchmanRun" (
    "shop" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchmanRun_pkey" PRIMARY KEY ("shop")
);

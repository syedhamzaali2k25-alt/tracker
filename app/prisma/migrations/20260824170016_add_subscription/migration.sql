-- CreateTable
CREATE TABLE "Subscription" (
    "shop" TEXT NOT NULL,
    "shopifySubscriptionId" TEXT,
    "status" TEXT NOT NULL,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("shop")
);

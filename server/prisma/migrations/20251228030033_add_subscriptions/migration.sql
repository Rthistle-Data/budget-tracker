-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "expectedAmount" REAL,
    "amountMin" REAL,
    "amountMax" REAL,
    "lastDate" TEXT,
    "nextDate" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "kind" TEXT NOT NULL DEFAULT 'subscription',
    "categoryId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SubscriptionIgnore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Subscription_userId_merchantKey_idx" ON "Subscription"("userId", "merchantKey");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionIgnore_userId_merchantKey_key" ON "SubscriptionIgnore"("userId", "merchantKey");

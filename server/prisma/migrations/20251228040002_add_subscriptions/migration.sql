-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Subscription" (
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Subscription" ("amountMax", "amountMin", "cadence", "categoryId", "confidence", "createdAt", "displayName", "expectedAmount", "id", "isActive", "kind", "lastDate", "merchantKey", "nextDate", "notes", "updatedAt", "userId") SELECT "amountMax", "amountMin", "cadence", "categoryId", "confidence", "createdAt", "displayName", "expectedAmount", "id", "isActive", "kind", "lastDate", "merchantKey", "nextDate", "notes", "updatedAt", "userId" FROM "Subscription";
DROP TABLE "Subscription";
ALTER TABLE "new_Subscription" RENAME TO "Subscription";
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");
CREATE INDEX "Subscription_userId_isActive_idx" ON "Subscription"("userId", "isActive");
CREATE INDEX "Subscription_userId_nextDate_idx" ON "Subscription"("userId", "nextDate");
CREATE UNIQUE INDEX "Subscription_userId_merchantKey_key" ON "Subscription"("userId", "merchantKey");
CREATE TABLE "new_SubscriptionIgnore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubscriptionIgnore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SubscriptionIgnore" ("createdAt", "id", "merchantKey", "userId") SELECT "createdAt", "id", "merchantKey", "userId" FROM "SubscriptionIgnore";
DROP TABLE "SubscriptionIgnore";
ALTER TABLE "new_SubscriptionIgnore" RENAME TO "SubscriptionIgnore";
CREATE INDEX "SubscriptionIgnore_userId_idx" ON "SubscriptionIgnore"("userId");
CREATE UNIQUE INDEX "SubscriptionIgnore_userId_merchantKey_key" ON "SubscriptionIgnore"("userId", "merchantKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

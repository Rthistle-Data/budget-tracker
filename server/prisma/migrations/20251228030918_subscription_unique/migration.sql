/*
  Warnings:

  - A unique constraint covering the columns `[userId,merchantKey]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Subscription_userId_merchantKey_idx";

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_userId_isActive_idx" ON "Subscription"("userId", "isActive");

-- CreateIndex
CREATE INDEX "Subscription_userId_nextDate_idx" ON "Subscription"("userId", "nextDate");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_merchantKey_key" ON "Subscription"("userId", "merchantKey");

-- CreateIndex
CREATE INDEX "SubscriptionIgnore_userId_idx" ON "SubscriptionIgnore"("userId");

-- DropIndex
DROP INDEX "Category_name_key";

-- CreateIndex
CREATE INDEX "Budget_userId_month_idx" ON "Budget"("userId", "month");

-- CreateIndex
CREATE INDEX "Category_userId_idx" ON "Category"("userId");

-- CreateIndex
CREATE INDEX "Recurring_userId_idx" ON "Recurring"("userId");

-- CreateIndex
CREATE INDEX "Recurring_userId_isActive_idx" ON "Recurring"("userId", "isActive");

-- CreateIndex
CREATE INDEX "Rule_userId_idx" ON "Rule"("userId");

-- CreateIndex
CREATE INDEX "Rule_userId_createdAt_idx" ON "Rule"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");

-- CreateIndex
CREATE INDEX "Transaction_userId_category_idx" ON "Transaction"("userId", "category");

-- CreateIndex
CREATE INDEX "Transaction_userId_merchant_idx" ON "Transaction"("userId", "merchant");

-- CreateIndex
CREATE INDEX "Transaction_userId_recurringId_idx" ON "Transaction"("userId", "recurringId");

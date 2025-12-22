/*
  Warnings:

  - A unique constraint covering the columns `[month,category]` on the table `Budget` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Budget_month_category_key" ON "Budget"("month", "category");

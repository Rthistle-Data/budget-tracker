-- CreateTable
CREATE TABLE "Recurring" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "category" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "dayOfMonth" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

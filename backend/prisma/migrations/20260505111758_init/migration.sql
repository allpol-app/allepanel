/*
  Warnings:

  - You are about to drop the column `packed` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `orders` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "orders_packed_idx";

-- DropIndex
DROP INDEX "orders_status_idx";

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "packed",
DROP COLUMN "status";

-- DropEnum
DROP TYPE "OrderLocalStatus";

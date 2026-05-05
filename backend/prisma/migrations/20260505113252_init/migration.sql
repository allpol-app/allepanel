/*
  Warnings:

  - You are about to drop the column `allegroLineItemId` on the `order_items` table. All the data in the column will be lost.
  - You are about to drop the column `allegroOfferId` on the `order_items` table. All the data in the column will be lost.
  - You are about to drop the column `productImage` on the `order_items` table. All the data in the column will be lost.
  - You are about to drop the column `allegroOrderId` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `allegroUpdatedAt` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `fulfillmentStatus` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `lineItemsSent` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `marketplaceId` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `orderStatus` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `revision` on the `orders` table. All the data in the column will be lost.
  - The `paymentType` column on the `orders` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `paymentProvider` column on the `orders` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[marketplaceAccountId,externalOrderId]` on the table `orders` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `externalOrderId` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketplace` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'PROCESSING', 'SENT', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "marketplace_accounts" DROP CONSTRAINT "marketplace_accounts_userId_fkey";

-- DropForeignKey
ALTER TABLE "oauth_states" DROP CONSTRAINT "oauth_states_marketplaceAccountId_fkey";

-- DropForeignKey
ALTER TABLE "oauth_states" DROP CONSTRAINT "oauth_states_userId_fkey";

-- DropIndex
DROP INDEX "order_items_allegroLineItemId_idx";

-- DropIndex
DROP INDEX "order_items_allegroOfferId_idx";

-- DropIndex
DROP INDEX "orders_allegroOrderId_key";

-- DropIndex
DROP INDEX "orders_allegroUpdatedAt_idx";

-- DropIndex
DROP INDEX "orders_fulfillmentStatus_idx";

-- DropIndex
DROP INDEX "orders_marketplaceId_idx";

-- DropIndex
DROP INDEX "orders_orderStatus_idx";

-- DropIndex
DROP INDEX "orders_revision_idx";

-- AlterTable
ALTER TABLE "order_items" DROP COLUMN "allegroLineItemId",
DROP COLUMN "allegroOfferId",
DROP COLUMN "productImage",
ADD COLUMN     "externalLineItemId" TEXT,
ADD COLUMN     "externalOfferId" TEXT,
ADD COLUMN     "productImageUrl" TEXT,
ADD COLUMN     "rawData" JSONB;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "allegroOrderId",
DROP COLUMN "allegroUpdatedAt",
DROP COLUMN "fulfillmentStatus",
DROP COLUMN "lineItemsSent",
DROP COLUMN "marketplaceId",
DROP COLUMN "orderStatus",
DROP COLUMN "revision",
ADD COLUMN     "externalFulfillmentStatus" TEXT,
ADD COLUMN     "externalLineItemsSentStatus" TEXT,
ADD COLUMN     "externalOrderId" TEXT NOT NULL,
ADD COLUMN     "externalOrderStatus" TEXT,
ADD COLUMN     "externalRevision" TEXT,
ADD COLUMN     "externalUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "marketplace" "Marketplace" NOT NULL,
ADD COLUMN     "marketplaceSiteId" TEXT,
ADD COLUMN     "rawData" JSONB,
ADD COLUMN     "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
ALTER COLUMN "totalAmount" DROP DEFAULT,
DROP COLUMN "paymentType",
ADD COLUMN     "paymentType" TEXT,
DROP COLUMN "paymentProvider",
ADD COLUMN     "paymentProvider" TEXT;

-- DropEnum
DROP TYPE "AllegroFulfillmentStatus";

-- DropEnum
DROP TYPE "AllegroLineItemsSent";

-- DropEnum
DROP TYPE "AllegroOrderStatus";

-- DropEnum
DROP TYPE "AllegroPaymentProvider";

-- DropEnum
DROP TYPE "AllegroPaymentType";

-- CreateIndex
CREATE INDEX "marketplace_accounts_marketplace_idx" ON "marketplace_accounts"("marketplace");

-- CreateIndex
CREATE INDEX "marketplace_accounts_externalAccountId_idx" ON "marketplace_accounts"("externalAccountId");

-- CreateIndex
CREATE INDEX "oauth_states_marketplace_idx" ON "oauth_states"("marketplace");

-- CreateIndex
CREATE INDEX "oauth_states_expiresAt_idx" ON "oauth_states"("expiresAt");

-- CreateIndex
CREATE INDEX "order_items_externalLineItemId_idx" ON "order_items"("externalLineItemId");

-- CreateIndex
CREATE INDEX "order_items_externalOfferId_idx" ON "order_items"("externalOfferId");

-- CreateIndex
CREATE INDEX "orders_marketplace_idx" ON "orders"("marketplace");

-- CreateIndex
CREATE INDEX "orders_userId_marketplace_idx" ON "orders"("userId", "marketplace");

-- CreateIndex
CREATE INDEX "orders_externalOrderId_idx" ON "orders"("externalOrderId");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_externalOrderStatus_idx" ON "orders"("externalOrderStatus");

-- CreateIndex
CREATE INDEX "orders_externalFulfillmentStatus_idx" ON "orders"("externalFulfillmentStatus");

-- CreateIndex
CREATE INDEX "orders_marketplaceSiteId_idx" ON "orders"("marketplaceSiteId");

-- CreateIndex
CREATE INDEX "orders_externalRevision_idx" ON "orders"("externalRevision");

-- CreateIndex
CREATE INDEX "orders_paymentType_idx" ON "orders"("paymentType");

-- CreateIndex
CREATE INDEX "orders_externalUpdatedAt_idx" ON "orders"("externalUpdatedAt");

-- CreateIndex
CREATE INDEX "orders_syncedAt_idx" ON "orders"("syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "orders_marketplaceAccountId_externalOrderId_key" ON "orders"("marketplaceAccountId", "externalOrderId");

-- AddForeignKey
ALTER TABLE "marketplace_accounts" ADD CONSTRAINT "marketplace_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_marketplaceAccountId_fkey" FOREIGN KEY ("marketplaceAccountId") REFERENCES "marketplace_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

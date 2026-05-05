-- CreateEnum
CREATE TYPE "OrderLocalStatus" AS ENUM ('NEW', 'PROCESSING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AllegroOrderStatus" AS ENUM ('BOUGHT', 'FILLED_IN', 'READY_FOR_PROCESSING', 'BUYER_CANCELLED');

-- CreateEnum
CREATE TYPE "AllegroFulfillmentStatus" AS ENUM ('NEW', 'PROCESSING', 'SENT');

-- CreateEnum
CREATE TYPE "AllegroLineItemsSent" AS ENUM ('ALL', 'SOME', 'NONE');

-- CreateEnum
CREATE TYPE "AllegroPaymentType" AS ENUM ('ONLINE', 'CASH_ON_DELIVERY', 'SPLIT_PAYMENT');

-- CreateEnum
CREATE TYPE "AllegroPaymentProvider" AS ENUM ('PAYU', 'P24', 'OFFLINE');

-- CreateTable
CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "allegroOrderId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "marketplaceAccountId" INTEGER NOT NULL,
    "status" "OrderLocalStatus" NOT NULL DEFAULT 'NEW',
    "packed" BOOLEAN NOT NULL DEFAULT false,
    "totalAmount" DECIMAL(12,2) DEFAULT 0,
    "totalToPay" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "orderCreatedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "allegroUpdatedAt" TIMESTAMP(3),
    "orderStatus" "AllegroOrderStatus",
    "fulfillmentStatus" "AllegroFulfillmentStatus",
    "lineItemsSent" "AllegroLineItemsSent",
    "deliveryMethodId" TEXT,
    "deliveryMethodName" TEXT,
    "deliveryFirstName" TEXT,
    "deliveryLastName" TEXT,
    "deliveryStreet" TEXT,
    "deliveryCity" TEXT,
    "deliveryZipCode" TEXT,
    "deliveryCountryCode" TEXT,
    "deliveryPhone" TEXT,
    "pickupPointId" TEXT,
    "pickupPointName" TEXT,
    "deliveryCost" DECIMAL(12,2),
    "deliveryCurrency" TEXT,
    "deliverySmart" BOOLEAN NOT NULL DEFAULT false,
    "buyerId" TEXT,
    "buyerLogin" TEXT,
    "buyerEmail" TEXT,
    "buyerFirstName" TEXT,
    "buyerLastName" TEXT,
    "buyerCompanyName" TEXT,
    "buyerPhone" TEXT,
    "buyerGuest" BOOLEAN NOT NULL DEFAULT false,
    "messageToSeller" TEXT,
    "paymentId" TEXT,
    "paymentType" "AllegroPaymentType",
    "paymentProvider" "AllegroPaymentProvider",
    "paymentFinishedAt" TIMESTAMP(3),
    "paymentAmount" DECIMAL(12,2),
    "paymentCurrency" TEXT,
    "invoiceRequired" BOOLEAN NOT NULL DEFAULT false,
    "revision" TEXT,
    "marketplaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "allegroLineItemId" TEXT,
    "allegroOfferId" TEXT,
    "productName" TEXT NOT NULL,
    "productImage" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "originalPrice" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "boughtAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_allegroOrderId_key" ON "orders"("allegroOrderId");

-- CreateIndex
CREATE INDEX "orders_userId_idx" ON "orders"("userId");

-- CreateIndex
CREATE INDEX "orders_marketplaceAccountId_idx" ON "orders"("marketplaceAccountId");

-- CreateIndex
CREATE INDEX "orders_userId_marketplaceAccountId_idx" ON "orders"("userId", "marketplaceAccountId");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_packed_idx" ON "orders"("packed");

-- CreateIndex
CREATE INDEX "orders_orderStatus_idx" ON "orders"("orderStatus");

-- CreateIndex
CREATE INDEX "orders_fulfillmentStatus_idx" ON "orders"("fulfillmentStatus");

-- CreateIndex
CREATE INDEX "orders_deliveryMethodName_idx" ON "orders"("deliveryMethodName");

-- CreateIndex
CREATE INDEX "orders_buyerId_idx" ON "orders"("buyerId");

-- CreateIndex
CREATE INDEX "orders_buyerEmail_idx" ON "orders"("buyerEmail");

-- CreateIndex
CREATE INDEX "orders_marketplaceId_idx" ON "orders"("marketplaceId");

-- CreateIndex
CREATE INDEX "orders_revision_idx" ON "orders"("revision");

-- CreateIndex
CREATE INDEX "orders_paymentType_idx" ON "orders"("paymentType");

-- CreateIndex
CREATE INDEX "orders_orderCreatedAt_idx" ON "orders"("orderCreatedAt");

-- CreateIndex
CREATE INDEX "orders_allegroUpdatedAt_idx" ON "orders"("allegroUpdatedAt");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_allegroLineItemId_idx" ON "order_items"("allegroLineItemId");

-- CreateIndex
CREATE INDEX "order_items_allegroOfferId_idx" ON "order_items"("allegroOfferId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_marketplaceAccountId_fkey" FOREIGN KEY ("marketplaceAccountId") REFERENCES "marketplace_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "ShippingProvider" AS ENUM ('INPOST_SHIPX');

-- CreateEnum
CREATE TYPE "ShippingAccountStatus" AS ENUM ('ACTIVE', 'DISCONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "shipping_accounts" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "provider" "ShippingProvider" NOT NULL,
    "accountName" TEXT,
    "organizationId" TEXT NOT NULL,
    "apiToken" TEXT NOT NULL,
    "organizationName" TEXT,
    "organizationEmail" TEXT,
    "status" "ShippingAccountStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "shipping_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shipping_accounts_userId_idx" ON "shipping_accounts"("userId");

-- CreateIndex
CREATE INDEX "shipping_accounts_userId_provider_idx" ON "shipping_accounts"("userId", "provider");

-- CreateIndex
CREATE INDEX "shipping_accounts_provider_idx" ON "shipping_accounts"("provider");

-- CreateIndex
CREATE INDEX "shipping_accounts_status_idx" ON "shipping_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "shipping_accounts_provider_organizationId_key" ON "shipping_accounts"("provider", "organizationId");

-- CreateIndex
CREATE INDEX "orders_userId_externalOrderStatus_externalFulfillmentStatus_idx" ON "orders"("userId", "externalOrderStatus", "externalFulfillmentStatus", "orderCreatedAt");

-- CreateIndex
CREATE INDEX "orders_userId_marketplaceAccountId_externalOrderStatus_exte_idx" ON "orders"("userId", "marketplaceAccountId", "externalOrderStatus", "externalFulfillmentStatus");

-- CreateIndex
CREATE INDEX "orders_userId_marketplace_externalOrderStatus_externalFulfi_idx" ON "orders"("userId", "marketplace", "externalOrderStatus", "externalFulfillmentStatus");

-- CreateIndex
CREATE INDEX "orders_userId_deliveryMethodName_orderCreatedAt_idx" ON "orders"("userId", "deliveryMethodName", "orderCreatedAt");

-- AddForeignKey
ALTER TABLE "shipping_accounts" ADD CONSTRAINT "shipping_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

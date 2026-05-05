-- CreateEnum
CREATE TYPE "ShipmentProvider" AS ENUM ('INPOST_SHIPX', 'ALLEGRO_SHIPMENT_MANAGEMENT', 'DPD', 'DHL', 'UPS', 'OTHER');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'CREATED', 'LABEL_READY', 'SENT', 'ERROR', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShipmentParcelSize" AS ENUM ('A', 'B', 'C', 'CUSTOM');

-- CreateTable
CREATE TABLE "shipments" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "shippingAccountId" INTEGER,
    "provider" "ShipmentProvider" NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "parcelSize" "ShipmentParcelSize",
    "weightKg" DECIMAL(10,3),
    "lengthCm" DECIMAL(10,2),
    "widthCm" DECIMAL(10,2),
    "heightCm" DECIMAL(10,2),
    "externalShipmentId" TEXT,
    "trackingNumber" TEXT,
    "labelFormat" TEXT,
    "labelPath" TEXT,
    "errorMessage" TEXT,
    "rawRequest" JSONB,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shipments_userId_idx" ON "shipments"("userId");

-- CreateIndex
CREATE INDEX "shipments_orderId_idx" ON "shipments"("orderId");

-- CreateIndex
CREATE INDEX "shipments_shippingAccountId_idx" ON "shipments"("shippingAccountId");

-- CreateIndex
CREATE INDEX "shipments_provider_idx" ON "shipments"("provider");

-- CreateIndex
CREATE INDEX "shipments_status_idx" ON "shipments"("status");

-- CreateIndex
CREATE INDEX "shipments_trackingNumber_idx" ON "shipments"("trackingNumber");

-- CreateIndex
CREATE INDEX "shipments_externalShipmentId_idx" ON "shipments"("externalShipmentId");

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_shippingAccountId_fkey" FOREIGN KEY ("shippingAccountId") REFERENCES "shipping_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "externalCommandId" TEXT;

-- CreateIndex
CREATE INDEX "shipments_externalCommandId_idx" ON "shipments"("externalCommandId");

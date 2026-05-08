-- AlterTable
ALTER TABLE "users" ADD COLUMN     "labelPrinterDpi" INTEGER DEFAULT 203,
ADD COLUMN     "labelPrinterFormat" TEXT DEFAULT 'zpl',
ADD COLUMN     "labelPrinterHeightMm" INTEGER DEFAULT 150,
ADD COLUMN     "labelPrinterName" TEXT,
ADD COLUMN     "labelPrinterWidthMm" INTEGER DEFAULT 100;

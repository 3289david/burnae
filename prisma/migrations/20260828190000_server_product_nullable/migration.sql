-- DropForeignKey
ALTER TABLE "Server" DROP CONSTRAINT "Server_productId_fkey";

-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "priceMonthlyKrwSnapshot" INTEGER,
ADD COLUMN     "productNameSnapshot" TEXT,
ALTER COLUMN "productId" DROP NOT NULL;

-- Backfill existing rows from their current product before the relation could ever go null
UPDATE "Server" s
SET "productNameSnapshot" = p.name,
    "priceMonthlyKrwSnapshot" = p."priceMonthlyKrw"
FROM "Product" p
WHERE s."productId" = p.id;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

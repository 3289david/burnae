-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "Order" ADD COLUMN "productNameSnapshot" TEXT;

-- DropForeignKey / AddForeignKey (RESTRICT -> SET NULL)
ALTER TABLE "Order" DROP CONSTRAINT "Order_productId_fkey";
ALTER TABLE "Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

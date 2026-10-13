-- AlterTable
ALTER TABLE "HostNode" ADD COLUMN     "dedicatedToUserId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "dedicatedNodeAlertSent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "requiresDedicatedNode" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "HostNode_dedicatedToUserId_key" ON "HostNode"("dedicatedToUserId");

-- AddForeignKey
ALTER TABLE "HostNode" ADD CONSTRAINT "HostNode_dedicatedToUserId_fkey" FOREIGN KEY ("dedicatedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

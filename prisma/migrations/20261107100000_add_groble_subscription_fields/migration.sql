ALTER TABLE "Order" ADD COLUMN "grobleSellerReference" TEXT;
ALTER TABLE "Order" ADD COLUMN "grobleMerchantUid" TEXT;
CREATE UNIQUE INDEX "Order_grobleSellerReference_key" ON "Order"("grobleSellerReference");
CREATE UNIQUE INDEX "Order_grobleMerchantUid_key" ON "Order"("grobleMerchantUid");

ALTER TABLE "Server" ADD COLUMN "grobleSubscriptionStatus" TEXT;
ALTER TABLE "Server" ADD COLUMN "grobleNextBillingDate" TIMESTAMP(3);

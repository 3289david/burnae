-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "isAdminGrant" BOOLEAN NOT NULL DEFAULT false;

-- 기존에 관리자가 지급했던 주문들도 소급 적용 (depositorName="관리자지급"은 grant-server 라우트가
-- 항상 고정으로 쓰는 값이라 신뢰할 수 있는 식별 기준)
UPDATE "Order" SET "isAdminGrant" = true WHERE "depositorName" = '관리자지급';

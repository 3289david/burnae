-- 통합 포인트로 합치기: AI 크레딧(1크레딧=20원)을 같은 가치의 포인트(1P=1원)로 환산해서
-- promotionPoints에 더해준 뒤, 더 이상 안 쓰는 aiCreditsRemaining 컬럼을 지운다.
UPDATE "User" SET "promotionPoints" = "promotionPoints" + ROUND("aiCreditsRemaining" * 20)::int;
ALTER TABLE "User" DROP COLUMN "aiCreditsRemaining";

-- Product.aiCreditsPerMonth(크레딧/월)도 같은 환산(×20)으로 포인트/월로 바꾼다
ALTER TABLE "Product" RENAME COLUMN "aiCreditsPerMonth" TO "pointsPerMonth";
UPDATE "Product" SET "pointsPerMonth" = "pointsPerMonth" * 20;

-- "포인트로 포인트를 사는" 꼴이 된 상점 항목은 더 이상 새로 교환할 수 없게 비활성화
-- (과거 교환 기록은 ShopRedemption에 그대로 남아있으니 안 건드림)
UPDATE "ShopItem" SET "active" = false WHERE "kind" = 'AI_CREDITS';

-- 채팅 레벨링: XP를 따로 저장하지 않고 포인트에서 바로 계산하도록 바꿔서 이 테이블 전체가 필요 없어졌다
DROP TABLE "UserActivityLevel";

-- 레벨↔칭호(역할) 매핑만 남긴다
CREATE TABLE "LevelRole" (
    "id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "discordRoleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "LevelRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LevelRole_level_key" ON "LevelRole"("level");
CREATE UNIQUE INDEX "LevelRole_discordRoleId_key" ON "LevelRole"("discordRoleId");
CREATE INDEX "LevelRole_level_idx" ON "LevelRole"("level");

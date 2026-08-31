-- 기존 VPS 카테고리 템플릿을 GENERAL로 흡수 (VPS를 별도 카테고리로 더 이상 두지 않음)
UPDATE "ServerTemplate" SET category = 'GENERAL' WHERE category = 'VPS';

-- Postgres는 enum 값을 직접 DROP할 수 없어서 새 타입을 만들고 컬럼을 옮긴 뒤 기존 타입을 교체한다
CREATE TYPE "ServerCategory_new" AS ENUM ('MINECRAFT', 'DISCORD_BOT', 'GENERAL');

ALTER TABLE "ServerTemplate" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "ServerTemplate" ALTER COLUMN "category" TYPE "ServerCategory_new" USING ("category"::text::"ServerCategory_new");
ALTER TABLE "ServerTemplate" ALTER COLUMN "category" SET DEFAULT 'MINECRAFT';

DROP TYPE "ServerCategory";
ALTER TYPE "ServerCategory_new" RENAME TO "ServerCategory";

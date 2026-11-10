-- 소셜 로그인 제공자(Google/GitHub/Discord)가 주는 프로필 사진 URL
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;

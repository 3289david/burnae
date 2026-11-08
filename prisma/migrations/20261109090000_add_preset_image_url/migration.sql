-- Gemini로 생성한 커뮤니티 프리셋 썸네일 이미지 경로. 생성 실패/대기 중이면 null.
ALTER TABLE "UserPreset" ADD COLUMN "imageUrl" TEXT;

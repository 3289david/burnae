-- 디스코드 /출석 명령어용 출석체크 기록
ALTER TABLE "User" ADD COLUMN "lastCheckinAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "checkinStreak" INTEGER NOT NULL DEFAULT 0;

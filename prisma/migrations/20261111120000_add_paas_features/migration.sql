-- 서버 일시정지(Suspend), 유지보수 모드, Pre-Deploy 커맨드, 환경변수 그룹(Render 스타일 기능 추가)

ALTER TABLE "Server" ADD COLUMN "pausedAt" TIMESTAMP(3);
ALTER TABLE "Server" ADD COLUMN "maintenanceModeEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Server" ADD COLUMN "preDeployCommand" TEXT;
ALTER TABLE "Server" ADD COLUMN "envGroupId" TEXT;

CREATE TABLE "EnvGroup" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvGroup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EnvGroup_ownerId_idx" ON "EnvGroup"("ownerId");

ALTER TABLE "EnvGroup" ADD CONSTRAINT "EnvGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Server" ADD CONSTRAINT "Server_envGroupId_fkey" FOREIGN KEY ("envGroupId") REFERENCES "EnvGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

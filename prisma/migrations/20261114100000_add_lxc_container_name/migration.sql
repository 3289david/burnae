-- LXC 기반 "VPS" 서버 식별용 컨테이너 이름
ALTER TABLE "Server" ADD COLUMN "lxcContainerName" TEXT;
CREATE UNIQUE INDEX "Server_lxcContainerName_key" ON "Server"("lxcContainerName");

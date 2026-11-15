-- 템플릿이 Pterodactyl 대신 LXC로 서비스되는지 표시
ALTER TABLE "ServerTemplate" ADD COLUMN "usesLxc" BOOLEAN NOT NULL DEFAULT false;

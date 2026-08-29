-- AlterTable
ALTER TABLE "HostNode" ADD COLUMN     "sftpPort" INTEGER NOT NULL DEFAULT 2022;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pterodactylUserId" INTEGER,
ADD COLUMN     "sftpPassword" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_pterodactylUserId_key" ON "User"("pterodactylUserId");

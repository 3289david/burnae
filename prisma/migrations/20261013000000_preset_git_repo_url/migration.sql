-- AlterTable
ALTER TABLE "UserPreset" DROP COLUMN "environment",
ADD COLUMN     "gitRepoUrl" TEXT NOT NULL;

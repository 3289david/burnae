-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ownerNote" TEXT;

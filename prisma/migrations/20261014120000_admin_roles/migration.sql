-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('COMMUNITY', 'PROMOTION', 'GENERAL', 'SUPER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminRole" "AdminRole";

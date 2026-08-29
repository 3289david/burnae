-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "extraPorts" JSONB NOT NULL DEFAULT '[]';

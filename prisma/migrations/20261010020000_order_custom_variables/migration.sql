-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customVariables" JSONB;

-- AlterTable
ALTER TABLE "ServerTemplate" ADD COLUMN     "variableSchema" JSONB;

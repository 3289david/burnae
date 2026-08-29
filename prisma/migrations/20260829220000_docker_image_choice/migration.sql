-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "dockerImageRequested" TEXT;

-- AlterTable
ALTER TABLE "ServerTemplate" ADD COLUMN     "availableDockerImages" JSONB;

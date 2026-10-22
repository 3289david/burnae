-- AlterTable
ALTER TABLE "AiConversation" ADD COLUMN     "model" TEXT NOT NULL DEFAULT 'sonnet';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "aiCreditsRemaining" SET DEFAULT 0,
ALTER COLUMN "aiCreditsRemaining" SET DATA TYPE DOUBLE PRECISION;

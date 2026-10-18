-- CreateEnum
CREATE TYPE "CustomDomainSslStatus" AS ENUM ('NONE', 'ISSUED', 'FAILED');

-- AlterTable
ALTER TABLE "ServerCustomDomain" ADD COLUMN     "sslEligible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sslError" TEXT,
ADD COLUMN     "sslIssuedAt" TIMESTAMP(3),
ADD COLUMN     "sslLastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "sslStatus" "CustomDomainSslStatus" NOT NULL DEFAULT 'NONE';

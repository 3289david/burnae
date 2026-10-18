-- CreateEnum
CREATE TYPE "CryptoCoin" AS ENUM ('USDT_TRC20', 'USDT_SOL', 'BTC', 'LTC', 'TRX', 'SOL');

-- CreateEnum
CREATE TYPE "CryptoPaymentStatus" AS ENUM ('PENDING', 'DETECTED', 'CONFIRMING', 'UNDERPAID', 'CONFIRMED', 'EXPIRED', 'FAILED', 'MANUAL_REVIEW');

-- CreateTable
CREATE TABLE "CryptoWalletConfig" (
    "id" TEXT NOT NULL,
    "coin" "CryptoCoin" NOT NULL,
    "xpub" TEXT,
    "addressPool" JSONB DEFAULT '[]',
    "confirmationsRequired" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "nextDerivationIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptoWalletConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "coin" "CryptoCoin" NOT NULL,
    "address" TEXT NOT NULL,
    "derivationIndex" INTEGER,
    "exchangeRateKrw" DECIMAL(65,30) NOT NULL,
    "amountCrypto" DECIMAL(65,30) NOT NULL,
    "receivedCrypto" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "status" "CryptoPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "transactions" JSONB NOT NULL DEFAULT '[]',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptoPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CryptoWalletConfig_coin_key" ON "CryptoWalletConfig"("coin");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoPayment_orderId_key" ON "CryptoPayment"("orderId");

-- CreateIndex
CREATE INDEX "CryptoPayment_status_idx" ON "CryptoPayment"("status");

-- CreateIndex
CREATE INDEX "CryptoPayment_coin_address_idx" ON "CryptoPayment"("coin", "address");

-- AddForeignKey
ALTER TABLE "CryptoPayment" ADD CONSTRAINT "CryptoPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

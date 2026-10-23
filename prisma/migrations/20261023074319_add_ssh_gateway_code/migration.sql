-- CreateTable
CREATE TABLE "SshGatewayCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "SshGatewayCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SshGatewayCode_code_key" ON "SshGatewayCode"("code");

-- CreateIndex
CREATE INDEX "SshGatewayCode_userId_idx" ON "SshGatewayCode"("userId");

-- AddForeignKey
ALTER TABLE "SshGatewayCode" ADD CONSTRAINT "SshGatewayCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

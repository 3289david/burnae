-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedPhoneNumber" TEXT;

-- CreateTable
CREATE TABLE "PhoneVerificationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneVerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhoneVerificationRequest_userId_key" ON "PhoneVerificationRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_verifiedPhoneNumber_key" ON "User"("verifiedPhoneNumber");

-- AddForeignKey
ALTER TABLE "PhoneVerificationRequest" ADD CONSTRAINT "PhoneVerificationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

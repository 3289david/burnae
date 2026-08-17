Loaded Prisma config from prisma.config.ts.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'GITHUB', 'DISCORD');

-- CreateEnum
CREATE TYPE "NodeStatus" AS ENUM ('ONLINE', 'OFFLINE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('NEW_SERVER', 'RENEWAL', 'UPGRADE');

-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('PROVISIONING', 'RUNNING', 'STOPPED', 'STARTING', 'STOPPING', 'SUSPENDED', 'ERROR', 'DELETING');

-- CreateEnum
CREATE TYPE "ServerMemberRole" AS ENUM ('ADMIN', 'MODERATOR', 'DEVELOPER', 'VIEWER');

-- CreateEnum
CREATE TYPE "CouponDiscountType" AS ENUM ('PERCENT', 'FIXED_KRW');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- CreateEnum
CREATE TYPE "AiRiskLevel" AS ENUM ('SAFE', 'CONFIRM', 'DANGEROUS');

-- CreateEnum
CREATE TYPE "AiActionStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "storageQuotaGbOverride" INTEGER,
    "aiCreditsRemaining" INTEGER NOT NULL DEFAULT 0,
    "preferredDepositorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostNode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "pterodactylNodeId" INTEGER NOT NULL,
    "fqdn" TEXT NOT NULL,
    "publicIp" TEXT NOT NULL,
    "totalRamMb" INTEGER NOT NULL,
    "totalDiskMb" INTEGER NOT NULL,
    "reservedRamMb" INTEGER NOT NULL DEFAULT 0,
    "reservedDiskMb" INTEGER NOT NULL DEFAULT 0,
    "cpuCores" INTEGER NOT NULL,
    "status" "NodeStatus" NOT NULL DEFAULT 'ONLINE',
    "autoDeployEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "pterodactylNestId" INTEGER NOT NULL,
    "pterodactylEggId" INTEGER NOT NULL,
    "dockerImage" TEXT NOT NULL,
    "startupCommand" TEXT NOT NULL,
    "minecraftVersions" TEXT[],
    "defaultEnvironment" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServerTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hosting_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "ramPricePerGbKrw" INTEGER NOT NULL DEFAULT 5000,
    "minRamGb" INTEGER NOT NULL DEFAULT 1,
    "maxRamGb" INTEGER NOT NULL DEFAULT 32,
    "defaultDiskGb" INTEGER NOT NULL DEFAULT 20,
    "diskPricePerGbKrw" INTEGER NOT NULL DEFAULT 100,
    "defaultBackupSlots" INTEGER NOT NULL DEFAULT 3,
    "backupPricePerSlotKrw" INTEGER NOT NULL DEFAULT 500,
    "defaultUserStorageGb" INTEGER NOT NULL DEFAULT 10,
    "maxCpuPercentPerServer" INTEGER NOT NULL DEFAULT 800,
    "siteName" TEXT NOT NULL DEFAULT 'Burnae',
    "siteDomain" TEXT NOT NULL DEFAULT 'burnae.kr',
    "subdomainZone" TEXT NOT NULL DEFAULT 'krl.kr',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hosting_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ramMb" INTEGER NOT NULL,
    "cpuPercent" INTEGER NOT NULL,
    "diskMb" INTEGER NOT NULL,
    "backupSlots" INTEGER NOT NULL DEFAULT 3,
    "aiCreditsPerMonth" INTEGER NOT NULL DEFAULT 0,
    "priceMonthlyKrw" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "OrderType" NOT NULL DEFAULT 'NEW_SERVER',
    "serverId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "amountKrw" INTEGER NOT NULL,
    "depositorName" TEXT NOT NULL,
    "couponId" TEXT,
    "discountKrw" INTEGER NOT NULL DEFAULT 0,
    "paysyncInvoiceId" TEXT,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "serverNameRequested" TEXT,
    "templateIdRequested" TEXT,
    "minecraftVersionRequested" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minecraftVersion" TEXT NOT NULL,
    "status" "ServerStatus" NOT NULL DEFAULT 'PROVISIONING',
    "pterodactylServerId" INTEGER,
    "pterodactylUuid" TEXT,
    "pterodactylIdentifier" TEXT,
    "ramMb" INTEGER NOT NULL,
    "cpuPercent" INTEGER NOT NULL,
    "diskMb" INTEGER NOT NULL,
    "backupSlots" INTEGER NOT NULL,
    "allocationIp" TEXT,
    "allocationPort" INTEGER,
    "whitelistEnabled" BOOLEAN NOT NULL DEFAULT false,
    "suspendedReason" TEXT,
    "renewalDueAt" TIMESTAMP(3),
    "lastBackupAt" TIMESTAMP(3),
    "autoBackupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoBackupIntervalHours" INTEGER NOT NULL DEFAULT 24,
    "autoRestartEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoRestartHour" INTEGER,
    "lastAutoRestartAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerMember" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ServerMemberRole" NOT NULL DEFAULT 'VIEWER',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerSubdomain" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "dnsARecordId" TEXT,
    "dnsSrvRecordId" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerSubdomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerCustomDomain" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerCustomDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Backup" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "pterodactylBackupId" TEXT,
    "name" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "CouponDiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "minOrderKrw" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "bannerImageUrl" TEXT,
    "couponId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccountSetting" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccountSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT,
    "title" TEXT NOT NULL DEFAULT '새 대화',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "conversationId" TEXT,
    "toolUseId" TEXT,
    "toolName" TEXT NOT NULL,
    "riskLevel" "AiRiskLevel" NOT NULL,
    "status" "AiActionStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "input" JSONB NOT NULL,
    "result" JSONB,
    "backupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "AiActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordLinkCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordLinkCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ProductToServerTemplate" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProductToServerTemplate_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_provider_providerAccountId_key" ON "OAuthAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "HostNode_pterodactylNodeId_key" ON "HostNode"("pterodactylNodeId");

-- CreateIndex
CREATE INDEX "HostNode_status_idx" ON "HostNode"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ServerTemplate_key_key" ON "ServerTemplate"("key");

-- CreateIndex
CREATE INDEX "ServerTemplate_active_idx" ON "ServerTemplate"("active");

-- CreateIndex
CREATE INDEX "Product_active_idx" ON "Product"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Order_paysyncInvoiceId_key" ON "Order"("paysyncInvoiceId");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_paysyncInvoiceId_idx" ON "Order"("paysyncInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Server_pterodactylServerId_key" ON "Server"("pterodactylServerId");

-- CreateIndex
CREATE UNIQUE INDEX "Server_pterodactylUuid_key" ON "Server"("pterodactylUuid");

-- CreateIndex
CREATE INDEX "Server_ownerId_idx" ON "Server"("ownerId");

-- CreateIndex
CREATE INDEX "Server_status_idx" ON "Server"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ServerMember_serverId_userId_key" ON "ServerMember"("serverId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerSubdomain_subdomain_key" ON "ServerSubdomain"("subdomain");

-- CreateIndex
CREATE INDEX "ServerSubdomain_serverId_idx" ON "ServerSubdomain"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerCustomDomain_hostname_key" ON "ServerCustomDomain"("hostname");

-- CreateIndex
CREATE INDEX "ServerCustomDomain_serverId_idx" ON "ServerCustomDomain"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "Backup_pterodactylBackupId_key" ON "Backup"("pterodactylBackupId");

-- CreateIndex
CREATE INDEX "Backup_serverId_idx" ON "Backup"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_couponId_userId_key" ON "CouponRedemption"("couponId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_couponId_key" ON "Event"("couponId");

-- CreateIndex
CREATE INDEX "AiConversation_userId_idx" ON "AiConversation"("userId");

-- CreateIndex
CREATE INDEX "AiConversation_serverId_idx" ON "AiConversation"("serverId");

-- CreateIndex
CREATE INDEX "AiMessage_conversationId_idx" ON "AiMessage"("conversationId");

-- CreateIndex
CREATE INDEX "AiActivityLog_userId_idx" ON "AiActivityLog"("userId");

-- CreateIndex
CREATE INDEX "AiActivityLog_serverId_idx" ON "AiActivityLog"("serverId");

-- CreateIndex
CREATE INDEX "AiActivityLog_conversationId_idx" ON "AiActivityLog"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordLink_userId_key" ON "DiscordLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordLink_discordUserId_key" ON "DiscordLink"("discordUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordLinkCode_code_key" ON "DiscordLinkCode"("code");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "_ProductToServerTemplate_B_index" ON "_ProductToServerTemplate"("B");

-- AddForeignKey
ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ServerTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "HostNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerMember" ADD CONSTRAINT "ServerMember_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerMember" ADD CONSTRAINT "ServerMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerSubdomain" ADD CONSTRAINT "ServerSubdomain_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerCustomDomain" ADD CONSTRAINT "ServerCustomDomain_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backup" ADD CONSTRAINT "Backup_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiActivityLog" ADD CONSTRAINT "AiActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiActivityLog" ADD CONSTRAINT "AiActivityLog_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordLink" ADD CONSTRAINT "DiscordLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductToServerTemplate" ADD CONSTRAINT "_ProductToServerTemplate_A_fkey" FOREIGN KEY ("A") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProductToServerTemplate" ADD CONSTRAINT "_ProductToServerTemplate_B_fkey" FOREIGN KEY ("B") REFERENCES "ServerTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;


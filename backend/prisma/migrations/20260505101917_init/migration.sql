-- CreateEnum
CREATE TYPE "Marketplace" AS ENUM ('ALLEGRO', 'ERLI');

-- CreateEnum
CREATE TYPE "MarketplaceAccountStatus" AS ENUM ('ACTIVE', 'DISCONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "companyName" TEXT,
    "taxId" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_accounts" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "status" "MarketplaceAccountStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "accountName" TEXT,
    "externalAccountId" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenType" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "marketplace_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_states" (
    "id" SERIAL NOT NULL,
    "stateToken" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "marketplaceAccountId" INTEGER NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "marketplace_accounts_userId_idx" ON "marketplace_accounts"("userId");

-- CreateIndex
CREATE INDEX "marketplace_accounts_userId_marketplace_idx" ON "marketplace_accounts"("userId", "marketplace");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_states_stateToken_key" ON "oauth_states"("stateToken");

-- CreateIndex
CREATE INDEX "oauth_states_userId_idx" ON "oauth_states"("userId");

-- CreateIndex
CREATE INDEX "oauth_states_stateToken_idx" ON "oauth_states"("stateToken");

-- CreateIndex
CREATE INDEX "oauth_states_marketplaceAccountId_idx" ON "oauth_states"("marketplaceAccountId");

-- AddForeignKey
ALTER TABLE "marketplace_accounts" ADD CONSTRAINT "marketplace_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_marketplaceAccountId_fkey" FOREIGN KEY ("marketplaceAccountId") REFERENCES "marketplace_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

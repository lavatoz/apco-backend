-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "tagline" TEXT,
    "projectType" TEXT NOT NULL,
    "logo" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "website" TEXT,
    "invoicePrefix" TEXT NOT NULL,
    "upiId" TEXT,
    "bankDetails" JSONB,
    "paymentTerms" TEXT NOT NULL DEFAULT 'Due on Receipt',
    "invoiceNotes" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#3B82F6',
    "themePreset" TEXT NOT NULL DEFAULT 'default',
    "graphicsPreset" TEXT NOT NULL DEFAULT 'default',
    "typographyPreset" TEXT NOT NULL DEFAULT 'default',
    "portalConfig" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "GlobalSetting_key_key" ON "GlobalSetting"("key");

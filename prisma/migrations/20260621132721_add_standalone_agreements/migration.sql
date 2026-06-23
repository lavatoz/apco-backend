-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('PENDING', 'SIGNED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('AADHAAR', 'DRIVING_LICENSE', 'PASSPORT', 'PAN', 'OTHER');

-- CreateTable
CREATE TABLE "StandaloneAgreementTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandaloneAgreementTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandaloneAgreement" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "AgreementStatus" NOT NULL DEFAULT 'PENDING',
    "generatedContent" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandaloneAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandaloneAgreementSignature" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signatureImageUrl" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandaloneAgreementSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandaloneAgreementDocument" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandaloneAgreementDocument_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "StandaloneAgreement" ADD CONSTRAINT "StandaloneAgreement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandaloneAgreement" ADD CONSTRAINT "StandaloneAgreement_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "StandaloneAgreementTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandaloneAgreementSignature" ADD CONSTRAINT "StandaloneAgreementSignature_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "StandaloneAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandaloneAgreementDocument" ADD CONSTRAINT "StandaloneAgreementDocument_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "StandaloneAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

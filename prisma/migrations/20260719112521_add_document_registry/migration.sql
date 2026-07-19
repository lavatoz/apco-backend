-- CreateTable
CREATE TABLE "DocumentRegistry" (
    "documentId" TEXT NOT NULL,
    "verificationUrl" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "companyId" TEXT,
    "sha256Hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'Active',

    CONSTRAINT "DocumentRegistry_pkey" PRIMARY KEY ("documentId")
);

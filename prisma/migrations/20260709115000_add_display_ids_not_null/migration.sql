-- AlterTable
ALTER TABLE "Client" ALTER COLUMN "clientCode" SET NOT NULL;

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "projectCode" SET NOT NULL;

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "invoiceCode" SET NOT NULL;

-- AlterTable
ALTER TABLE "Quotation" ALTER COLUMN "quotationCode" SET NOT NULL;

-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "eventCode" SET NOT NULL;

-- AlterTable
ALTER TABLE "StandaloneAgreement" ALTER COLUMN "agreementCode" SET NOT NULL;

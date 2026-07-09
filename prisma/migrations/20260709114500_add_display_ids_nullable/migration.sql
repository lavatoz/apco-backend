-- AlterTable
ALTER TABLE "Client" ADD COLUMN "clientCode" TEXT;
CREATE UNIQUE INDEX "Client_clientCode_key" ON "Client"("clientCode");

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "projectCode" TEXT;
CREATE UNIQUE INDEX "Project_projectCode_key" ON "Project"("projectCode");

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "invoiceCode" TEXT;
CREATE UNIQUE INDEX "Invoice_invoiceCode_key" ON "Invoice"("invoiceCode");

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN "quotationCode" TEXT;
CREATE UNIQUE INDEX "Quotation_quotationCode_key" ON "Quotation"("quotationCode");

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "eventCode" TEXT;
CREATE UNIQUE INDEX "Event_eventCode_key" ON "Event"("eventCode");

-- AlterTable
ALTER TABLE "StandaloneAgreement" ADD COLUMN "agreementCode" TEXT;
CREATE UNIQUE INDEX "StandaloneAgreement_agreementCode_key" ON "StandaloneAgreement"("agreementCode");

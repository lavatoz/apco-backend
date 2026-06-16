-- AlterTable
ALTER TABLE "Project" ADD COLUMN "driveFolderId" TEXT,
ADD COLUMN "galleryFolderId" TEXT,
ADD COLUMN "deliverablesFolderId" TEXT,
ADD COLUMN "agreementsFolderId" TEXT,
ADD COLUMN "invoicesFolderId" TEXT,
ADD COLUMN "quotationsFolderId" TEXT;

-- AlterTable
ALTER TABLE "File" ADD COLUMN "googleDriveFileId" TEXT,
ADD COLUMN "googleDriveViewLink" TEXT;

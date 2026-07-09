-- CreateEnum
CREATE TYPE "WorkflowStageType" AS ENUM ('CLIENT_ONBOARDING', 'AGREEMENT', 'ADVANCE_PAYMENT', 'PRE_PRODUCTION', 'SHOOT', 'POST_PRODUCTION', 'EDITING', 'DELIVERY', 'PROJECT_CLOSURE');

-- CreateEnum
CREATE TYPE "WorkflowStageStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "GalleryStatus" AS ENUM ('UPLOADED', 'SELECTION_IN_PROGRESS', 'SELECTION_SUBMITTED', 'READY_FOR_EDITING', 'EDITING', 'EDITED', 'DELIVERED');

-- CreateTable
CREATE TABLE "WorkflowStage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stageType" "WorkflowStageType" NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "status" "WorkflowStageStatus" NOT NULL DEFAULT 'PENDING',
    "ownerId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStageAttachment" (
    "id" TEXT NOT NULL,
    "workflowStageId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowStageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowActivity" (
    "id" TEXT NOT NULL,
    "workflowStageId" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "oldStatus" "WorkflowStageStatus" NOT NULL,
    "newStatus" "WorkflowStageStatus" NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectGallery" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "currentStatus" "GalleryStatus" NOT NULL DEFAULT 'UPLOADED',
    "selectionLocked" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectGallery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryPhoto" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoSelection" (
    "id" TEXT NOT NULL,
    "galleryPhotoId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhotoSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoReview" (
    "id" TEXT NOT NULL,
    "galleryPhotoId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMessage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowStage_projectId_idx" ON "WorkflowStage"("projectId");

-- CreateIndex
CREATE INDEX "WorkflowStage_ownerId_idx" ON "WorkflowStage"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStage_projectId_stageType_key" ON "WorkflowStage"("projectId", "stageType");

-- CreateIndex
CREATE INDEX "WorkflowStageAttachment_workflowStageId_idx" ON "WorkflowStageAttachment"("workflowStageId");

-- CreateIndex
CREATE INDEX "WorkflowStageAttachment_fileId_idx" ON "WorkflowStageAttachment"("fileId");

-- CreateIndex
CREATE INDEX "WorkflowActivity_workflowStageId_idx" ON "WorkflowActivity"("workflowStageId");

-- CreateIndex
CREATE INDEX "WorkflowActivity_changedBy_idx" ON "WorkflowActivity"("changedBy");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectGallery_projectId_key" ON "ProjectGallery"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryPhoto_projectId_fileId_key" ON "GalleryPhoto"("projectId", "fileId");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoSelection_galleryPhotoId_clientId_projectId_key" ON "PhotoSelection"("galleryPhotoId", "clientId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoReview_galleryPhotoId_clientId_projectId_key" ON "PhotoReview"("galleryPhotoId", "clientId", "projectId");

-- CreateIndex
CREATE INDEX "ProjectMessage_projectId_createdAt_idx" ON "ProjectMessage"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkflowStage" ADD CONSTRAINT "WorkflowStage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStage" ADD CONSTRAINT "WorkflowStage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStageAttachment" ADD CONSTRAINT "WorkflowStageAttachment_workflowStageId_fkey" FOREIGN KEY ("workflowStageId") REFERENCES "WorkflowStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStageAttachment" ADD CONSTRAINT "WorkflowStageAttachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowActivity" ADD CONSTRAINT "WorkflowActivity_workflowStageId_fkey" FOREIGN KEY ("workflowStageId") REFERENCES "WorkflowStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowActivity" ADD CONSTRAINT "WorkflowActivity_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGallery" ADD CONSTRAINT "ProjectGallery_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryPhoto" ADD CONSTRAINT "GalleryPhoto_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryPhoto" ADD CONSTRAINT "GalleryPhoto_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoSelection" ADD CONSTRAINT "PhotoSelection_galleryPhotoId_fkey" FOREIGN KEY ("galleryPhotoId") REFERENCES "GalleryPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoSelection" ADD CONSTRAINT "PhotoSelection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoSelection" ADD CONSTRAINT "PhotoSelection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoReview" ADD CONSTRAINT "PhotoReview_galleryPhotoId_fkey" FOREIGN KEY ("galleryPhotoId") REFERENCES "GalleryPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoReview" ADD CONSTRAINT "PhotoReview_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoReview" ADD CONSTRAINT "PhotoReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMessage" ADD CONSTRAINT "ProjectMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMessage" ADD CONSTRAINT "ProjectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

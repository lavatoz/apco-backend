-- AlterEnum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'Marketing';

-- CreateTable
CREATE TABLE "GalleryCollection" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "heroImage" TEXT,
    "coverImage" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryImage" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "caption" TEXT,
    "altText" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GalleryCollection_slug_key" ON "GalleryCollection"("slug");

-- CreateIndex
CREATE INDEX "GalleryCollection_slug_idx" ON "GalleryCollection"("slug");

-- CreateIndex
CREATE INDEX "GalleryCollection_isPublished_displayOrder_idx" ON "GalleryCollection"("isPublished", "displayOrder");

-- CreateIndex
CREATE INDEX "GalleryImage_collectionId_displayOrder_idx" ON "GalleryImage"("collectionId", "displayOrder");

-- AddForeignKey
ALTER TABLE "GalleryImage" ADD CONSTRAINT "GalleryImage_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "GalleryCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

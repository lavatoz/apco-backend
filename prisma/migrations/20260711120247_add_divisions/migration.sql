-- CreateEnum
CREATE TYPE "DivisionMediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "Division" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instagramUrl" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "coverMediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Division_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DivisionMedia" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "type" "DivisionMediaType" NOT NULL,
    "position" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DivisionMedia_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DivisionMedia" ADD CONSTRAINT "DivisionMedia_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;

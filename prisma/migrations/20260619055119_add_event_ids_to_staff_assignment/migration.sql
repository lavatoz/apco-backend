-- AlterTable
ALTER TABLE "StaffAssignment" ADD COLUMN     "eventIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

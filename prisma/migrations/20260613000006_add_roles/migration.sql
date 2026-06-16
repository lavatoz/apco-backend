-- Migration: 20260613000006_add_roles
-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'DroneOperator';
ALTER TYPE "Role" ADD VALUE 'Designer';

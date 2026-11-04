-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'ORDER_LATE';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "lateSince" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('RECEIVED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('COUNTER', 'DELIVERY_PLATFORM');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('ORDER_CREATED', 'ORDER_STATUS_CHANGED');

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "day" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL,
    "channel" "OrderChannel" NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "version" INTEGER NOT NULL,
    "statusChangedAt" TIMESTAMP(3) NOT NULL,
    "externalId" TEXT,
    "deliveryCep" TEXT,
    "deliveryStreet" TEXT,
    "deliveryNumber" TEXT,
    "deliveryDistrict" TEXT,
    "deliveryCity" TEXT,
    "deliveryState" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCounter" (
    "day" TEXT NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "DailyCounter_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "Event" (
    "seq" BIGSERIAL NOT NULL,
    "type" "EventType" NOT NULL,
    "orderId" UUID NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "version" INTEGER NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_day_number_key" ON "Order"("day", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_channel_externalId_key" ON "Order"("channel", "externalId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "Event_orderId_idx" ON "Event"("orderId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

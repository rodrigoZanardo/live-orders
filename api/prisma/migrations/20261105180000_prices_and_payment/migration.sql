-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'PIX', 'CARD');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "changeFor" INTEGER,
ADD COLUMN     "paymentMethod" "PaymentMethod";

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "unitPrice" INTEGER;

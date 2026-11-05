-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CUSTOMER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "addressCep" TEXT,
ADD COLUMN     "addressCity" TEXT,
ADD COLUMN     "addressComplement" TEXT,
ADD COLUMN     "addressDistrict" TEXT,
ADD COLUMN     "addressNumber" TEXT,
ADD COLUMN     "addressState" TEXT,
ADD COLUMN     "addressStreet" TEXT,
ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerId" UUID;

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

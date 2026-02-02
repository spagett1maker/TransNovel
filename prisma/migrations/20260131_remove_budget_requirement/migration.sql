-- AlterTable: Make totalAmount optional on ProjectContract
ALTER TABLE "ProjectContract" ALTER COLUMN "totalAmount" DROP NOT NULL;

-- AlterTable: Make priceQuote optional on ProjectApplication
ALTER TABLE "ProjectApplication" ALTER COLUMN "priceQuote" DROP NOT NULL;

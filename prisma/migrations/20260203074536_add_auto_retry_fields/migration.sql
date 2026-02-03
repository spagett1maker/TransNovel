-- AlterTable
ALTER TABLE "ActiveTranslationJob" ADD COLUMN     "autoRetryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxAutoRetries" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "ActiveTranslationJob" ADD COLUMN     "batchPlan" JSONB,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "currentBatchIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failedChapterNums" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedBy" TEXT,
ADD COLUMN     "maxRetries" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalBatches" INTEGER NOT NULL DEFAULT 0;

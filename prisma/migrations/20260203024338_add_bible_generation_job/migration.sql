-- CreateEnum
CREATE TYPE "BibleJobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "BibleGenerationJob" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BibleJobStatus" NOT NULL DEFAULT 'PENDING',
    "batchPlan" JSONB NOT NULL,
    "totalBatches" INTEGER NOT NULL,
    "currentBatchIndex" INTEGER NOT NULL DEFAULT 0,
    "analyzedChapters" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "errorMessage" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,

    CONSTRAINT "BibleGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BibleGenerationJob_status_idx" ON "BibleGenerationJob"("status");

-- CreateIndex
CREATE INDEX "BibleGenerationJob_workId_idx" ON "BibleGenerationJob"("workId");

-- AddForeignKey
ALTER TABLE "BibleGenerationJob" ADD CONSTRAINT "BibleGenerationJob_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

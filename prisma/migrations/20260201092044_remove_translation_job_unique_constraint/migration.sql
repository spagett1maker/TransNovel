-- DropIndex
DROP INDEX "ActiveTranslationJob_workId_status_key";

-- CreateIndex
CREATE INDEX "ActiveTranslationJob_workId_status_idx" ON "ActiveTranslationJob"("workId", "status");

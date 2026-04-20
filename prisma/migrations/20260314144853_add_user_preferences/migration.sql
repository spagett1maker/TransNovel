-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preferences" JSONB NOT NULL DEFAULT '{}';

-- CreateIndex
CREATE INDEX "ActiveTranslationJob_status_updatedAt_idx" ON "ActiveTranslationJob"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ActiveTranslationJob_userId_status_idx" ON "ActiveTranslationJob"("userId", "status");

-- CreateIndex
CREATE INDEX "BibleGenerationJob_workId_status_idx" ON "BibleGenerationJob"("workId", "status");

-- CreateIndex
CREATE INDEX "BibleGenerationJob_createdAt_idx" ON "BibleGenerationJob"("createdAt");

-- CreateIndex
CREATE INDEX "Character_bibleId_isConfirmed_idx" ON "Character"("bibleId", "isConfirmed");

-- CreateIndex
CREATE INDEX "SettingTerm_bibleId_isConfirmed_idx" ON "SettingTerm"("bibleId", "isConfirmed");

-- CreateIndex
CREATE INDEX "SettingTerm_bibleId_category_idx" ON "SettingTerm"("bibleId", "category");

-- CreateIndex
CREATE INDEX "TimelineEvent_bibleId_eventType_idx" ON "TimelineEvent"("bibleId", "eventType");

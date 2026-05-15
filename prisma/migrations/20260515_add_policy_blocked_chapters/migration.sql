-- AlterTable
ALTER TABLE "ActiveTranslationJob"
  ADD COLUMN "policyBlockedChapterNums" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "TranslationJobHistory"
  ADD COLUMN "policyBlockedChapterNums" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

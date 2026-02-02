-- CreateEnum
CREATE TYPE "BibleStatus" AS ENUM ('GENERATING', 'DRAFT', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "CharacterRole" AS ENUM ('PROTAGONIST', 'ANTAGONIST', 'SUPPORTING', 'MINOR');

-- CreateEnum
CREATE TYPE "TermCategory" AS ENUM ('CHARACTER', 'PLACE', 'ORGANIZATION', 'RANK_TITLE', 'SKILL_TECHNIQUE', 'ITEM', 'OTHER');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('PLOT', 'CHARACTER_DEV', 'FORESHADOWING', 'REVEAL', 'WORLD_BUILDING');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "LogCategory" AS ENUM ('TRANSLATION', 'API_CALL', 'RATE_LIMIT', 'CHUNK', 'CHAPTER', 'JOB', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SnapshotType" AS ENUM ('MANUAL', 'AUTO_SAVE', 'STATUS_CHANGE', 'RETRANSLATE');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('INSERT', 'DELETE', 'REPLACE');

-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('COMMENT_ADDED', 'COMMENT_RESOLVED', 'COMMENT_REPLIED', 'EDIT_MADE', 'CHANGE_ACCEPTED', 'CHANGE_REJECTED', 'STATUS_CHANGED', 'SNAPSHOT_CREATED', 'SNAPSHOT_RESTORED');

-- CreateEnum
CREATE TYPE "EditorAvailability" AS ENUM ('AVAILABLE', 'BUSY', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ProjectListingStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ListingVisibility" AS ENUM ('PUBLIC', 'INVITED_ONLY');

-- CreateEnum
CREATE TYPE "RevisionRequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WorkStatus" ADD VALUE 'BIBLE_GENERATING';
ALTER TYPE "WorkStatus" ADD VALUE 'BIBLE_DRAFT';
ALTER TYPE "WorkStatus" ADD VALUE 'BIBLE_CONFIRMED';

-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN     "lastEditedAt" TIMESTAMP(3),
ADD COLUMN     "lastEditedById" TEXT,
ADD COLUMN     "trackChangesState" JSONB;

-- CreateTable
CREATE TABLE "TranslationLog" (
    "id" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "category" "LogCategory" NOT NULL DEFAULT 'TRANSLATION',
    "jobId" TEXT,
    "workId" TEXT,
    "chapterId" TEXT,
    "chapterNum" INTEGER,
    "chunkIndex" INTEGER,
    "userId" TEXT,
    "userEmail" TEXT,
    "message" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorStack" TEXT,
    "metadata" JSONB,
    "durationMs" INTEGER,
    "retryCount" INTEGER,
    "clientIp" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveTranslationJob" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "workTitle" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "isPauseRequested" BOOLEAN NOT NULL DEFAULT false,
    "totalChapters" INTEGER NOT NULL,
    "completedChapters" INTEGER NOT NULL DEFAULT 0,
    "failedChapters" INTEGER NOT NULL DEFAULT 0,
    "currentChapterNum" INTEGER,
    "currentChunkIndex" INTEGER,
    "totalChunks" INTEGER,
    "chaptersProgress" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActiveTranslationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationJobHistory" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "workTitle" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT,
    "status" TEXT NOT NULL,
    "totalChapters" INTEGER NOT NULL,
    "completedChapters" INTEGER NOT NULL,
    "failedChapters" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "failedChapterNums" INTEGER[],
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslationJobHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettingBible" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "status" "BibleStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "translationGuide" TEXT,
    "analyzedChapters" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettingBible_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "nameOriginal" TEXT NOT NULL,
    "nameKorean" TEXT NOT NULL,
    "nameHanja" TEXT,
    "titles" TEXT[],
    "aliases" TEXT[],
    "personality" TEXT,
    "speechStyle" TEXT,
    "role" "CharacterRole" NOT NULL DEFAULT 'SUPPORTING',
    "description" TEXT,
    "relationships" JSONB,
    "firstAppearance" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettingTerm" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "original" TEXT NOT NULL,
    "translated" TEXT NOT NULL,
    "category" "TermCategory" NOT NULL,
    "note" TEXT,
    "context" TEXT,
    "firstAppearance" INTEGER,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SettingTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "chapterStart" INTEGER NOT NULL,
    "chapterEnd" INTEGER,
    "eventType" "EventType" NOT NULL DEFAULT 'PLOT',
    "importance" INTEGER NOT NULL DEFAULT 1,
    "isForeshadowing" BOOLEAN NOT NULL DEFAULT false,
    "foreshadowNote" TEXT,
    "involvedCharacterIds" TEXT[],

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterComment" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "textRange" JSONB,
    "quotedText" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterSnapshot" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "snapshotType" "SnapshotType" NOT NULL DEFAULT 'MANUAL',
    "originalContent" TEXT NOT NULL,
    "translatedContent" TEXT,
    "editedContent" TEXT,
    "status" "ChapterStatus" NOT NULL,
    "triggerEvent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterChange" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "changeType" "ChangeType" NOT NULL,
    "fromPos" INTEGER NOT NULL,
    "toPos" INTEGER NOT NULL,
    "oldText" TEXT,
    "newText" TEXT,
    "status" "ChangeStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterActivity" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "activityType" "ActivityType" NOT NULL,
    "metadata" JSONB,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "bio" TEXT,
    "portfolioUrl" TEXT,
    "specialtyGenres" TEXT[],
    "languages" TEXT[],
    "availability" "EditorAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "maxConcurrent" INTEGER NOT NULL DEFAULT 3,
    "completedProjects" INTEGER NOT NULL DEFAULT 0,
    "averageRating" DOUBLE PRECISION,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioItem" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "genre" TEXT,
    "sampleText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectListing" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "visibility" "ListingVisibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "ProjectListingStatus" NOT NULL DEFAULT 'DRAFT',
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "deadline" TIMESTAMP(3),
    "chapterStart" INTEGER,
    "chapterEnd" INTEGER,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "applicationCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectInvitation" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "editorProfileId" TEXT NOT NULL,
    "message" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectApplication" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "editorProfileId" TEXT NOT NULL,
    "proposalMessage" TEXT NOT NULL,
    "priceQuote" INTEGER NOT NULL,
    "estimatedDays" INTEGER,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "authorNote" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectContract" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "expectedEndDate" TIMESTAMP(3),
    "chapterStart" INTEGER NOT NULL,
    "chapterEnd" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterRevisionRequest" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "specificFeedback" TEXT,
    "status" "RevisionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "response" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "revisionCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ChapterRevisionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorReview" (
    "id" TEXT NOT NULL,
    "editorProfileId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "overallRating" INTEGER NOT NULL,
    "qualityRating" INTEGER,
    "speedRating" INTEGER,
    "communicationRating" INTEGER,
    "content" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TranslationLog_level_idx" ON "TranslationLog"("level");

-- CreateIndex
CREATE INDEX "TranslationLog_category_idx" ON "TranslationLog"("category");

-- CreateIndex
CREATE INDEX "TranslationLog_jobId_idx" ON "TranslationLog"("jobId");

-- CreateIndex
CREATE INDEX "TranslationLog_workId_idx" ON "TranslationLog"("workId");

-- CreateIndex
CREATE INDEX "TranslationLog_userId_idx" ON "TranslationLog"("userId");

-- CreateIndex
CREATE INDEX "TranslationLog_errorCode_idx" ON "TranslationLog"("errorCode");

-- CreateIndex
CREATE INDEX "TranslationLog_createdAt_idx" ON "TranslationLog"("createdAt");

-- CreateIndex
CREATE INDEX "TranslationLog_level_createdAt_idx" ON "TranslationLog"("level", "createdAt");

-- CreateIndex
CREATE INDEX "TranslationLog_category_createdAt_idx" ON "TranslationLog"("category", "createdAt");

-- CreateIndex
CREATE INDEX "TranslationLog_level_category_idx" ON "TranslationLog"("level", "category");

-- CreateIndex
CREATE INDEX "TranslationLog_workId_createdAt_idx" ON "TranslationLog"("workId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveTranslationJob_jobId_key" ON "ActiveTranslationJob"("jobId");

-- CreateIndex
CREATE INDEX "ActiveTranslationJob_workId_idx" ON "ActiveTranslationJob"("workId");

-- CreateIndex
CREATE INDEX "ActiveTranslationJob_userId_idx" ON "ActiveTranslationJob"("userId");

-- CreateIndex
CREATE INDEX "ActiveTranslationJob_status_idx" ON "ActiveTranslationJob"("status");

-- CreateIndex
CREATE INDEX "ActiveTranslationJob_updatedAt_idx" ON "ActiveTranslationJob"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveTranslationJob_workId_status_key" ON "ActiveTranslationJob"("workId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationJobHistory_jobId_key" ON "TranslationJobHistory"("jobId");

-- CreateIndex
CREATE INDEX "TranslationJobHistory_workId_idx" ON "TranslationJobHistory"("workId");

-- CreateIndex
CREATE INDEX "TranslationJobHistory_userId_idx" ON "TranslationJobHistory"("userId");

-- CreateIndex
CREATE INDEX "TranslationJobHistory_status_idx" ON "TranslationJobHistory"("status");

-- CreateIndex
CREATE INDEX "TranslationJobHistory_createdAt_idx" ON "TranslationJobHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SettingBible_workId_key" ON "SettingBible"("workId");

-- CreateIndex
CREATE INDEX "Character_bibleId_idx" ON "Character"("bibleId");

-- CreateIndex
CREATE UNIQUE INDEX "Character_bibleId_nameOriginal_key" ON "Character"("bibleId", "nameOriginal");

-- CreateIndex
CREATE INDEX "SettingTerm_bibleId_idx" ON "SettingTerm"("bibleId");

-- CreateIndex
CREATE INDEX "SettingTerm_category_idx" ON "SettingTerm"("category");

-- CreateIndex
CREATE UNIQUE INDEX "SettingTerm_bibleId_original_key" ON "SettingTerm"("bibleId", "original");

-- CreateIndex
CREATE INDEX "TimelineEvent_bibleId_idx" ON "TimelineEvent"("bibleId");

-- CreateIndex
CREATE INDEX "TimelineEvent_chapterStart_idx" ON "TimelineEvent"("chapterStart");

-- CreateIndex
CREATE INDEX "ChapterComment_chapterId_idx" ON "ChapterComment"("chapterId");

-- CreateIndex
CREATE INDEX "ChapterComment_chapterId_isResolved_idx" ON "ChapterComment"("chapterId", "isResolved");

-- CreateIndex
CREATE INDEX "ChapterComment_authorId_idx" ON "ChapterComment"("authorId");

-- CreateIndex
CREATE INDEX "ChapterComment_parentId_idx" ON "ChapterComment"("parentId");

-- CreateIndex
CREATE INDEX "ChapterSnapshot_chapterId_idx" ON "ChapterSnapshot"("chapterId");

-- CreateIndex
CREATE INDEX "ChapterSnapshot_chapterId_createdAt_idx" ON "ChapterSnapshot"("chapterId", "createdAt");

-- CreateIndex
CREATE INDEX "ChapterSnapshot_authorId_idx" ON "ChapterSnapshot"("authorId");

-- CreateIndex
CREATE INDEX "ChapterChange_chapterId_idx" ON "ChapterChange"("chapterId");

-- CreateIndex
CREATE INDEX "ChapterChange_chapterId_status_idx" ON "ChapterChange"("chapterId", "status");

-- CreateIndex
CREATE INDEX "ChapterChange_authorId_idx" ON "ChapterChange"("authorId");

-- CreateIndex
CREATE INDEX "ChapterActivity_chapterId_idx" ON "ChapterActivity"("chapterId");

-- CreateIndex
CREATE INDEX "ChapterActivity_chapterId_createdAt_idx" ON "ChapterActivity"("chapterId", "createdAt");

-- CreateIndex
CREATE INDEX "ChapterActivity_actorId_idx" ON "ChapterActivity"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "EditorProfile_userId_key" ON "EditorProfile"("userId");

-- CreateIndex
CREATE INDEX "EditorProfile_availability_idx" ON "EditorProfile"("availability");

-- CreateIndex
CREATE INDEX "EditorProfile_averageRating_idx" ON "EditorProfile"("averageRating");

-- CreateIndex
CREATE INDEX "EditorProfile_availability_averageRating_idx" ON "EditorProfile"("availability", "averageRating");

-- CreateIndex
CREATE INDEX "PortfolioItem_profileId_idx" ON "PortfolioItem"("profileId");

-- CreateIndex
CREATE INDEX "ProjectListing_status_idx" ON "ProjectListing"("status");

-- CreateIndex
CREATE INDEX "ProjectListing_visibility_idx" ON "ProjectListing"("visibility");

-- CreateIndex
CREATE INDEX "ProjectListing_status_visibility_idx" ON "ProjectListing"("status", "visibility");

-- CreateIndex
CREATE INDEX "ProjectListing_workId_idx" ON "ProjectListing"("workId");

-- CreateIndex
CREATE INDEX "ProjectListing_authorId_idx" ON "ProjectListing"("authorId");

-- CreateIndex
CREATE INDEX "ProjectInvitation_listingId_idx" ON "ProjectInvitation"("listingId");

-- CreateIndex
CREATE INDEX "ProjectInvitation_editorProfileId_idx" ON "ProjectInvitation"("editorProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInvitation_listingId_editorProfileId_key" ON "ProjectInvitation"("listingId", "editorProfileId");

-- CreateIndex
CREATE INDEX "ProjectApplication_listingId_idx" ON "ProjectApplication"("listingId");

-- CreateIndex
CREATE INDEX "ProjectApplication_editorProfileId_idx" ON "ProjectApplication"("editorProfileId");

-- CreateIndex
CREATE INDEX "ProjectApplication_status_idx" ON "ProjectApplication"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectApplication_listingId_editorProfileId_key" ON "ProjectApplication"("listingId", "editorProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectContract_listingId_key" ON "ProjectContract"("listingId");

-- CreateIndex
CREATE INDEX "ProjectContract_workId_idx" ON "ProjectContract"("workId");

-- CreateIndex
CREATE INDEX "ProjectContract_authorId_idx" ON "ProjectContract"("authorId");

-- CreateIndex
CREATE INDEX "ProjectContract_editorId_idx" ON "ProjectContract"("editorId");

-- CreateIndex
CREATE INDEX "ProjectContract_isActive_idx" ON "ProjectContract"("isActive");

-- CreateIndex
CREATE INDEX "ChapterRevisionRequest_contractId_idx" ON "ChapterRevisionRequest"("contractId");

-- CreateIndex
CREATE INDEX "ChapterRevisionRequest_chapterId_idx" ON "ChapterRevisionRequest"("chapterId");

-- CreateIndex
CREATE INDEX "ChapterRevisionRequest_contractId_status_idx" ON "ChapterRevisionRequest"("contractId", "status");

-- CreateIndex
CREATE INDEX "EditorReview_editorProfileId_idx" ON "EditorReview"("editorProfileId");

-- CreateIndex
CREATE INDEX "EditorReview_authorId_idx" ON "EditorReview"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "EditorReview_editorProfileId_authorId_workId_key" ON "EditorReview"("editorProfileId", "authorId", "workId");

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_lastEditedById_fkey" FOREIGN KEY ("lastEditedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettingBible" ADD CONSTRAINT "SettingBible_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_bibleId_fkey" FOREIGN KEY ("bibleId") REFERENCES "SettingBible"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettingTerm" ADD CONSTRAINT "SettingTerm_bibleId_fkey" FOREIGN KEY ("bibleId") REFERENCES "SettingBible"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_bibleId_fkey" FOREIGN KEY ("bibleId") REFERENCES "SettingBible"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterComment" ADD CONSTRAINT "ChapterComment_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterComment" ADD CONSTRAINT "ChapterComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterComment" ADD CONSTRAINT "ChapterComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChapterComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterComment" ADD CONSTRAINT "ChapterComment_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterSnapshot" ADD CONSTRAINT "ChapterSnapshot_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterSnapshot" ADD CONSTRAINT "ChapterSnapshot_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterChange" ADD CONSTRAINT "ChapterChange_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterChange" ADD CONSTRAINT "ChapterChange_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterChange" ADD CONSTRAINT "ChapterChange_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterActivity" ADD CONSTRAINT "ChapterActivity_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterActivity" ADD CONSTRAINT "ChapterActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorProfile" ADD CONSTRAINT "EditorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "EditorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectListing" ADD CONSTRAINT "ProjectListing_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectListing" ADD CONSTRAINT "ProjectListing_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInvitation" ADD CONSTRAINT "ProjectInvitation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ProjectListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInvitation" ADD CONSTRAINT "ProjectInvitation_editorProfileId_fkey" FOREIGN KEY ("editorProfileId") REFERENCES "EditorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectApplication" ADD CONSTRAINT "ProjectApplication_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ProjectListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectApplication" ADD CONSTRAINT "ProjectApplication_editorProfileId_fkey" FOREIGN KEY ("editorProfileId") REFERENCES "EditorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContract" ADD CONSTRAINT "ProjectContract_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ProjectListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContract" ADD CONSTRAINT "ProjectContract_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContract" ADD CONSTRAINT "ProjectContract_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContract" ADD CONSTRAINT "ProjectContract_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterRevisionRequest" ADD CONSTRAINT "ChapterRevisionRequest_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProjectContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterRevisionRequest" ADD CONSTRAINT "ChapterRevisionRequest_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterRevisionRequest" ADD CONSTRAINT "ChapterRevisionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorReview" ADD CONSTRAINT "EditorReview_editorProfileId_fkey" FOREIGN KEY ("editorProfileId") REFERENCES "EditorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorReview" ADD CONSTRAINT "EditorReview_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorReview" ADD CONSTRAINT "EditorReview_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

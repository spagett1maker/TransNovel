-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('AUTHOR', 'EDITOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "AgeRating" AS ENUM ('ALL', 'FIFTEEN', 'NINETEEN');

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('PREPARING', 'ONGOING', 'REGISTERED', 'TRANSLATING', 'PROOFREADING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OriginalStatus" AS ENUM ('ONGOING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SourceLanguage" AS ENUM ('ZH', 'JA', 'EN', 'OTHER');

-- CreateEnum
CREATE TYPE "ChapterStatus" AS ENUM ('PENDING', 'TRANSLATING', 'TRANSLATED', 'REVIEWING', 'EDITED', 'APPROVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'AUTHOR',
    "image" TEXT,
    "emailVerified" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "titleKo" TEXT NOT NULL,
    "titleOriginal" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "ageRating" "AgeRating" NOT NULL DEFAULT 'ALL',
    "status" "WorkStatus" NOT NULL DEFAULT 'REGISTERED',
    "coverImage" TEXT,
    "synopsis" TEXT NOT NULL,
    "genres" TEXT[],
    "originalStatus" "OriginalStatus" NOT NULL DEFAULT 'COMPLETED',
    "sourceLanguage" "SourceLanguage" NOT NULL DEFAULT 'ZH',
    "expectedChapters" INTEGER,
    "platformName" TEXT,
    "platformUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "totalChapters" INTEGER NOT NULL DEFAULT 0,
    "authorId" TEXT NOT NULL,
    "editorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "workId" TEXT NOT NULL,

    CONSTRAINT "Creator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT,
    "originalContent" TEXT NOT NULL,
    "translatedContent" TEXT,
    "editedContent" TEXT,
    "status" "ChapterStatus" NOT NULL DEFAULT 'PENDING',
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "workId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlossaryItem" (
    "id" TEXT NOT NULL,
    "original" TEXT NOT NULL,
    "translated" TEXT NOT NULL,
    "category" TEXT,
    "note" TEXT,
    "workId" TEXT NOT NULL,

    CONSTRAINT "GlossaryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_email_token_key" ON "PasswordResetToken"("email", "token");

-- CreateIndex
CREATE INDEX "Work_authorId_idx" ON "Work"("authorId");

-- CreateIndex
CREATE INDEX "Work_editorId_idx" ON "Work"("editorId");

-- CreateIndex
CREATE INDEX "Work_status_idx" ON "Work"("status");

-- CreateIndex
CREATE INDEX "Work_updatedAt_idx" ON "Work"("updatedAt");

-- CreateIndex
CREATE INDEX "Creator_workId_idx" ON "Creator"("workId");

-- CreateIndex
CREATE INDEX "Chapter_workId_idx" ON "Chapter"("workId");

-- CreateIndex
CREATE INDEX "Chapter_status_idx" ON "Chapter"("status");

-- CreateIndex
CREATE INDEX "Chapter_workId_status_idx" ON "Chapter"("workId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_workId_number_key" ON "Chapter"("workId", "number");

-- CreateIndex
CREATE INDEX "GlossaryItem_workId_idx" ON "GlossaryItem"("workId");

-- CreateIndex
CREATE UNIQUE INDEX "GlossaryItem_workId_original_key" ON "GlossaryItem"("workId", "original");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creator" ADD CONSTRAINT "Creator_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlossaryItem" ADD CONSTRAINT "GlossaryItem_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

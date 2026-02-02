-- DropForeignKey
ALTER TABLE "ChapterActivity" DROP CONSTRAINT "ChapterActivity_actorId_fkey";

-- DropForeignKey
ALTER TABLE "ChapterChange" DROP CONSTRAINT "ChapterChange_authorId_fkey";

-- DropForeignKey
ALTER TABLE "ChapterComment" DROP CONSTRAINT "ChapterComment_authorId_fkey";

-- DropForeignKey
ALTER TABLE "ChapterRevisionRequest" DROP CONSTRAINT "ChapterRevisionRequest_requestedById_fkey";

-- DropForeignKey
ALTER TABLE "ChapterSnapshot" DROP CONSTRAINT "ChapterSnapshot_authorId_fkey";

-- DropForeignKey
ALTER TABLE "EditorReview" DROP CONSTRAINT "EditorReview_authorId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectListing" DROP CONSTRAINT "ProjectListing_authorId_fkey";

-- DropForeignKey
ALTER TABLE "Work" DROP CONSTRAINT "Work_authorId_fkey";

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterComment" ADD CONSTRAINT "ChapterComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterSnapshot" ADD CONSTRAINT "ChapterSnapshot_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterChange" ADD CONSTRAINT "ChapterChange_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterActivity" ADD CONSTRAINT "ChapterActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectListing" ADD CONSTRAINT "ProjectListing_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterRevisionRequest" ADD CONSTRAINT "ChapterRevisionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorReview" ADD CONSTRAINT "EditorReview_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

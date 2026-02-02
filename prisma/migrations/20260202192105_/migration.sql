/*
  Warnings:

  - A unique constraint covering the columns `[bibleId,title,chapterStart]` on the table `TimelineEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "TimelineEvent_bibleId_title_chapterStart_key" ON "TimelineEvent"("bibleId", "title", "chapterStart");

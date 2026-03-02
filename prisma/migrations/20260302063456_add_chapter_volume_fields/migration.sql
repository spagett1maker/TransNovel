-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN     "volume" TEXT,
ADD COLUMN     "volumeNumber" INTEGER;

-- CreateIndex
CREATE INDEX "Chapter_workId_volume_idx" ON "Chapter"("workId", "volume");

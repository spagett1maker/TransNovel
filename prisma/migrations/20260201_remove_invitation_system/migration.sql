-- DropForeignKey
ALTER TABLE "ProjectInvitation" DROP CONSTRAINT "ProjectInvitation_editorProfileId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectInvitation" DROP CONSTRAINT "ProjectInvitation_listingId_fkey";

-- DropIndex
DROP INDEX "ProjectListing_status_visibility_idx";

-- DropIndex
DROP INDEX "ProjectListing_status_visibility_publishedAt_idx";

-- DropIndex
DROP INDEX "ProjectListing_visibility_idx";

-- AlterTable
ALTER TABLE "ProjectListing" DROP COLUMN "visibility";

-- DropTable
DROP TABLE "ProjectInvitation";

-- DropEnum
DROP TYPE "ListingVisibility";

-- CreateIndex
CREATE INDEX "ProjectListing_status_publishedAt_idx" ON "ProjectListing"("status", "publishedAt");

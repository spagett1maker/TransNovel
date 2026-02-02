-- CreateIndex
CREATE INDEX "EditorReview_editorProfileId_createdAt_idx" ON "EditorReview"("editorProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "EditorReview_authorId_workId_idx" ON "EditorReview"("authorId", "workId");

-- CreateIndex
CREATE INDEX "ProjectApplication_status_listingId_idx" ON "ProjectApplication"("status", "listingId");

-- CreateIndex
CREATE INDEX "ProjectContract_authorId_isActive_idx" ON "ProjectContract"("authorId", "isActive");

-- CreateIndex
CREATE INDEX "ProjectContract_editorId_isActive_idx" ON "ProjectContract"("editorId", "isActive");

-- CreateIndex
CREATE INDEX "ProjectListing_status_visibility_publishedAt_idx" ON "ProjectListing"("status", "visibility", "publishedAt");

-- CreateIndex
CREATE INDEX "ProjectListing_authorId_status_idx" ON "ProjectListing"("authorId", "status");

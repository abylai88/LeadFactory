ALTER TABLE "Company" ADD COLUMN "sourceId" TEXT, ADD COLUMN "sourceUrl" TEXT, ADD COLUMN "foundAt" TIMESTAMP(3), ADD COLUMN "enrichedAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "contactKey" TEXT;
CREATE UNIQUE INDEX "Company_workspaceId_sourceId_key" ON "Company"("workspaceId", "sourceId");
CREATE UNIQUE INDEX "Lead_companyId_contactKey_key" ON "Lead"("companyId", "contactKey");
CREATE TABLE "SearchRun" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL,
  "niche" TEXT NOT NULL, "city" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "count" INTEGER NOT NULL DEFAULT 0, "error" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "SearchRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SearchRun_workspaceId_createdAt_idx" ON "SearchRun"("workspaceId", "createdAt");

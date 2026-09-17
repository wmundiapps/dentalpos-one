CREATE TABLE IF NOT EXISTS "PlatformFeedback" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userName" TEXT NOT NULL,
  "userEmail" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "module" TEXT,
  "pagePath" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'Média',
  "status" TEXT NOT NULL DEFAULT 'Enviado',
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformFeedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PlatformFeedback_clinicId_idx" ON "PlatformFeedback"("clinicId");
CREATE INDEX IF NOT EXISTS "PlatformFeedback_status_idx" ON "PlatformFeedback"("status");
CREATE INDEX IF NOT EXISTS "PlatformFeedback_createdAt_idx" ON "PlatformFeedback"("createdAt");
ALTER TABLE "PlatformFeedback" ENABLE ROW LEVEL SECURITY;
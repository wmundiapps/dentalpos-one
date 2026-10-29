-- Marcadores coloridos da agenda.
CREATE TABLE IF NOT EXISTS "AppointmentMarker" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#9E9E9E',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AppointmentMarker_clinicId_idx" ON "AppointmentMarker"("clinicId");
CREATE TABLE IF NOT EXISTS "AppointmentMarkerLink" (
  "appointmentId" TEXT NOT NULL,
  "markerId" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("appointmentId", "markerId")
);
CREATE INDEX IF NOT EXISTS "AppointmentMarkerLink_clinicId_appointmentId_idx" ON "AppointmentMarkerLink"("clinicId","appointmentId");
ALTER TABLE "AppointmentMarker" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppointmentMarkerLink" ENABLE ROW LEVEL SECURITY;

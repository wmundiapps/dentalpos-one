$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$schema = Join-Path $root 'backend\prisma\schema.prisma'
$routes = Join-Path $root 'backend\src\routes\index.ts'

if (!(Test-Path $schema)) { throw "schema.prisma não encontrado em $schema" }
if (!(Test-Path $routes)) { throw "routes/index.ts não encontrado em $routes" }

$schemaText = Get-Content $schema -Raw
$marker = 'model SmartSchedulingPolicy {'
if ($schemaText -notmatch [regex]::Escape($marker)) {
$models = @'

// ======================
// BLOCO 17 - AGENDA INTELIGENTE / BACKEND
// Critério clínico sempre prioritário; financeiro é apenas fator auxiliar e alerta.
// ======================

model SmartSchedulingPolicy {
  id                            String   @id @default(cuid())
  clinicId                      String   @unique
  tenantId                      String
  enabled                       Boolean  @default(true)
  respectPreferredWeekday       Boolean  @default(true)
  financeOptimizationEnabled    Boolean  @default(true)
  financeNeverOverridesClinical Boolean  @default(true)
  overdueWarningOnly            Boolean  @default(true)
  defaultDurationMinutes        Int      @default(30)
  defaultReturnIntervalDays     Int      @default(14)
  maxLookAheadDays              Int      @default(180)
  createdAt                     DateTime @default(now())
  updatedAt                     DateTime @updatedAt

  @@index([tenantId])
}

model SmartProcedureRule {
  id                          String   @id @default(cuid())
  clinicId                    String
  tenantId                    String
  procedureKey                String
  procedureName               String
  durationMinutes             Int      @default(30)
  clinicalMinReturnDays       Int      @default(0)
  clinicalMaxReturnDays       Int?
  preferredReturnIntervalDays Int?
  isActive                    Boolean  @default(true)
  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt

  @@unique([clinicId, procedureKey])
  @@index([clinicId, isActive])
  @@index([tenantId])
}

model SmartLaboratoryRule {
  id             String   @id @default(cuid())
  clinicId       String
  tenantId       String
  laboratoryName String
  serviceKey     String
  serviceName    String
  leadTimeDays   Int      @default(15)
  safetyDays     Int      @default(0)
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([clinicId, laboratoryName, serviceKey])
  @@index([clinicId, isActive])
  @@index([tenantId])
}

model PatientSchedulingPreference {
  id                 String   @id @default(cuid())
  clinicId           String
  tenantId           String
  patientId          String
  preferredWeekday   Int?
  preferredTimeStart String?
  preferredTimeEnd   String?
  notes              String?
  source             String   @default("MANUAL")
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@unique([clinicId, patientId])
  @@index([tenantId])
}

model SmartSchedulingDecision {
  id                    String   @id @default(cuid())
  clinicId              String
  tenantId              String
  patientId             String
  appointmentId         String?
  procedure             String
  durationMinutes       Int
  referenceAt           DateTime
  clinicalEarliestAt    DateTime
  clinicalLatestAt      DateTime?
  laboratoryReadyAt     DateTime?
  financeReferenceAt    DateTime?
  suggestedReturnAt     DateTime
  chosenReturnAt        DateTime?
  recommendation        String
  warnings              Json?
  factors               Json?
  status                String   @default("SUGGESTED")
  overridden            Boolean  @default(false)
  overrideReason        String?
  createdById           String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([clinicId, patientId, createdAt])
  @@index([clinicId, status])
  @@index([appointmentId])
  @@index([tenantId])
}
'@
  Add-Content -Path $schema -Value $models
}

$routeText = Get-Content $routes -Raw
$importLine = "import * as smartSchedulingController from '../controllers/smartSchedulingController'"
if ($routeText -notmatch [regex]::Escape($importLine)) {
  $anchor = "import * as platformReadinessController from '../controllers/platformReadinessController'"
  if ($routeText -notmatch [regex]::Escape($anchor)) { throw 'Âncora de imports não encontrada em routes/index.ts' }
  $routeText = $routeText.Replace($anchor, "$anchor`r`n$importLine")
}

$routeMarker = "router.get('/smart-scheduling/config'"
if ($routeText -notmatch [regex]::Escape($routeMarker)) {
  $anchor = "// ======================`r`n// SCHEDULES`r`n// ======================"
  if ($routeText -notmatch [regex]::Escape($anchor)) {
    $anchor = "// ======================`n// SCHEDULES`n// ======================"
  }
  if ($routeText -notmatch [regex]::Escape($anchor)) { throw 'Âncora SCHEDULES não encontrada em routes/index.ts' }
  $block = @'
// ======================
// SMART SCHEDULING / AGENDA INTELIGENTE
// ======================

router.get('/smart-scheduling/config', requirePermission('agenda.view'), smartSchedulingController.config)
router.post('/smart-scheduling/bootstrap', requirePermission('agenda.edit'), smartSchedulingController.bootstrap)
router.put('/smart-scheduling/policy', requirePermission('agenda.edit'), smartSchedulingController.updatePolicy)
router.put('/smart-scheduling/procedure-rules/:procedureKey', requirePermission('agenda.edit'), smartSchedulingController.upsertProcedureRule)
router.put('/smart-scheduling/laboratory-rules', requirePermission('agenda.edit'), smartSchedulingController.upsertLaboratoryRule)
router.get('/patients/:patientId/scheduling-preference', requirePermission('agenda.view'), smartSchedulingController.patientPreference)
router.put('/patients/:patientId/scheduling-preference', requirePermission('agenda.edit'), smartSchedulingController.updatePatientPreference)
router.post('/smart-scheduling/suggest', requirePermission('agenda.create'), smartSchedulingController.suggest)
router.get('/smart-scheduling/decisions', requirePermission('agenda.view'), smartSchedulingController.decisions)
router.post('/smart-scheduling/decisions/:id/accept', requirePermission('agenda.edit'), smartSchedulingController.acceptDecision)
router.post('/smart-scheduling/decisions/:id/override', requirePermission('agenda.edit'), smartSchedulingController.overrideDecision)

'@
  $routeText = $routeText.Replace($anchor, "$block$anchor")
}
Set-Content -Path $routes -Value $routeText -Encoding UTF8

Write-Host 'OK: Bloco 17 aplicado ao schema e às rotas.'


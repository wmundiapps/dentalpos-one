param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$Service = "postgres",
  [string]$SourceDatabase = "dentalpos",
  [string]$TargetDatabase = "dentalpos_restore_test",
  [string]$User = "dentalpos",
  [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"

if (-not $ConfirmRestore) {
  throw "Restauração não executada. Rode novamente com -ConfirmRestore. O alvo padrão é uma base separada: dentalpos_restore_test."
}

if (-not (Test-Path $BackupFile)) {
  throw "Arquivo de backup não encontrado: $BackupFile"
}

if ($TargetDatabase -eq $SourceDatabase) {
  throw "Proteção ativa: o script não restaura sobre a base principal. Use uma base de teste separada."
}

$resolved = Resolve-Path $BackupFile
$remoteName = Split-Path $resolved -Leaf
$remotePath = "/tmp/$remoteName"

Write-Host "Copiando backup para o container..."
& docker compose cp $resolved "${Service}:${remotePath}"
if ($LASTEXITCODE -ne 0) { throw "Falha ao copiar backup para o container." }

Write-Host "Recriando base de teste $TargetDatabase..."
& docker compose exec -T $Service dropdb -U $User --if-exists $TargetDatabase
if ($LASTEXITCODE -ne 0) { throw "Falha ao remover a base de teste anterior." }

& docker compose exec -T $Service createdb -U $User $TargetDatabase
if ($LASTEXITCODE -ne 0) { throw "Falha ao criar a base de teste." }

Write-Host "Restaurando backup..."
& docker compose exec -T $Service pg_restore -U $User -d $TargetDatabase --no-owner --no-privileges $remotePath
if ($LASTEXITCODE -ne 0) { throw "pg_restore falhou." }

& docker compose exec -T $Service rm -f $remotePath
if ($LASTEXITCODE -ne 0) { Write-Warning "Não foi possível remover o arquivo temporário do container." }

Write-Host "Restauração de teste concluída em $TargetDatabase."
Write-Host "Valide a base restaurada antes de registrar BACKUP_LAST_RESTORE_TEST_AT."

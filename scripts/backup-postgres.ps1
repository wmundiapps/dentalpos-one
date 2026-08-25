param(
  [string]$OutputDirectory = ".\backups",
  [string]$Service = "postgres",
  [string]$Database = "dentalpos",
  [string]$User = "dentalpos"
)

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupName = "dentalpos-$timestamp.dump"
$remotePath = "/tmp/$backupName"

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$localPath = Join-Path (Resolve-Path $OutputDirectory) $backupName

Write-Host "Gerando backup PostgreSQL em formato custom..."
& docker compose exec -T $Service pg_dump -U $User -d $Database --format=custom --no-owner --no-privileges --file=$remotePath
if ($LASTEXITCODE -ne 0) { throw "pg_dump falhou." }

& docker compose cp "${Service}:${remotePath}" $localPath
if ($LASTEXITCODE -ne 0) { throw "Falha ao copiar o backup para o host." }

& docker compose exec -T $Service rm -f $remotePath
if ($LASTEXITCODE -ne 0) { Write-Warning "Não foi possível remover o arquivo temporário do container." }

$hash = Get-FileHash -Algorithm SHA256 -Path $localPath
$hashPath = "$localPath.sha256.txt"
"$($hash.Hash)  $backupName" | Set-Content -Encoding ASCII $hashPath

Write-Host "Backup concluído: $localPath"
Write-Host "SHA256: $($hash.Hash)"

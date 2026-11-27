# Uso (PowerShell, na pasta deploy\edumaster-local):  .\INICIAR.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path node_modules)) { npm install }
node iniciar.mjs

# DentalPos - baixa os Dados Abertos do CNPJ (Receita Federal), descompacta e gera a lista de prospecção.
# Uso (PowerShell, na raiz do repositório):
#   .\scripts\baixar-leads-receita.ps1 -Teste            # só a parte 0 de cada arquivo (rápido, lista parcial)
#   .\scripts\baixar-leads-receita.ps1                   # todas as partes (vários GB), lista completa
# Opções: -Uf PR   -Pasta C:\dados-cnpj   -Mes 2026-09   -Categorias clinica-odontologica,laboratorio-protese
# As categorias e os CNAEs ficam em data\cnae-categorias.json (o mapa do DentalPos).
# A Receita só responde a internet brasileira: rode no computador da clínica.
param(
  [string]$Uf = 'PR',
  [string]$Pasta = 'C:\dados-cnpj',
  [string]$Mes = '',
  [string]$Categorias = '',
  [switch]$Teste
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instale o Node.js (https://nodejs.org) e rode de novo.' }
if (-not (Test-Path 'scripts\receita-prospects.mjs')) { throw 'Rode este comando na raiz do repositório dentalpos-one.' }

$baixar = @('scripts\receita-baixar.mjs', '--pasta', $Pasta)
if ($Mes) { $baixar += @('--mes', $Mes) }
if ($Teste) { $baixar += '--teste' }
& node @baixar
if ($LASTEXITCODE -ne 0) { throw 'O download da Receita não terminou. Veja a mensagem acima.' }

Get-ChildItem -Path $Pasta -Filter '*.zip' | ForEach-Object {
  Write-Host "Descompactando $($_.Name) ..."
  Expand-Archive -Force -Path $_.FullName -DestinationPath $Pasta
}

Write-Host 'Gerando a lista de prospecção ...'
$gerar = @('scripts\receita-prospects.mjs', '--pasta', $Pasta, '--uf', $Uf)
if ($Categorias) { $gerar += @('--categorias', $Categorias) }
& node @gerar
if ($LASTEXITCODE -ne 0) { throw 'Não consegui gerar a lista. Veja a mensagem acima.' }
Write-Host "Pronto. Importe o arquivo prospects-$Uf.json no painel /prospeccao."

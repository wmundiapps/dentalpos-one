# DentalPos One - baixa os Dados Abertos do CNPJ (Receita Federal), descompacta e gera a lista de prospecção.
# Uso (PowerShell, na raiz do repositório):
#   .\scripts\baixar-leads-receita.ps1 -Teste            # só a parte 0 de cada arquivo (rápido, lista parcial)
#   .\scripts\baixar-leads-receita.ps1                   # todas as partes (vários GB), lista completa
# Opções: -Uf PR   -Pasta C:\dados-cnpj   -Mes 2026-09   -Cnaes 8630504,3250706
param(
  [string]$Uf = 'PR',
  [string]$Pasta = 'C:\dados-cnpj',
  [string]$Mes = '',
  [string]$Cnaes = '8630504',
  [switch]$Teste
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$base = 'https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instale o Node.js (https://nodejs.org) e rode de novo.' }
if (-not (Test-Path 'scripts\receita-prospects.mjs')) { throw 'Rode este comando na raiz do repositório dentalpos-one.' }

if (-not $Mes) {
  $html = (Invoke-WebRequest -UseBasicParsing $base).Content
  $meses = [regex]::Matches($html, '(\d{4}-\d{2})/') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
  if (-not $meses) { throw "Não consegui listar os meses em $base. Abra no navegador e use -Mes AAAA-MM." }
  $Mes = $meses[-1]
}
Write-Host "Mês dos dados: $Mes"
New-Item -ItemType Directory -Force -Path $Pasta | Out-Null

$ultimo = if ($Teste) { 0 } else { 9 }
$arquivos = @('Simples.zip', 'Municipios.zip')
0..$ultimo | ForEach-Object { $arquivos += "Estabelecimentos$_.zip"; $arquivos += "Empresas$_.zip" }

foreach ($nome in $arquivos) {
  $zip = Join-Path $Pasta $nome
  if (-not (Test-Path $zip)) {
    Write-Host "Baixando $nome ..."
    Invoke-WebRequest -UseBasicParsing -Uri "$base$Mes/$nome" -OutFile $zip
  }
  Write-Host "Descompactando $nome ..."
  Expand-Archive -Force -Path $zip -DestinationPath $Pasta
}

Write-Host 'Gerando a lista de prospecção ...'
node scripts/receita-prospects.mjs --pasta $Pasta --uf $Uf --cnaes $Cnaes
Write-Host "Pronto. Importe o arquivo prospects-$Uf.json no painel /prospeccao."

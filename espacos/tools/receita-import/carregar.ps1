# SpaceHour - carga dos dentistas do Parana (Receita Federal). Aberto pelo CARREGAR-DENTISTAS-PR.bat.
$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
Write-Host ''
Write-Host 'SpaceHour - carga dos dentistas do Parana (Receita Federal)' -ForegroundColor Cyan
Write-Host ''
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Falta o Node.js. Vou abrir o site: instale a versao LTS e rode de novo.' -ForegroundColor Yellow
  Start-Process 'https://nodejs.org'
  return
}
if (-not (Test-Path 'node_modules')) {
  Write-Host 'Preparando na primeira vez...'
  npm install --no-audit --no-fund | Out-Null
}
Write-Host '1) Na Vercel, copie o valor de DATABASE_URL_UNPOOLED.'
Write-Host '2) Volte aqui, clique com o botao direito para colar e aperte Enter.'
Write-Host '   (Nao mostre esta tela a ninguem: o endereco tem a senha do banco.)'
Write-Host ''
$url = (Read-Host 'Endereco do banco').Trim()
if ($url -notlike 'postgres*') {
  Write-Host 'Isso nao e o endereco do banco (ele comeca com postgresql://). Rode de novo.' -ForegroundColor Red
  return
}
Clear-Host
Write-Host 'Endereco OK. Baixando a base da Receita e gravando os dentistas do PR.' -ForegroundColor Green
Write-Host 'Leva de 30 a 90 minutos. Pode minimizar esta janela, mas NAO feche.'
Write-Host ''
$env:DATABASE_URL = $url
# Tenta o mes mais recente; se a Receita ainda estiver enviando os arquivos, usa o mes anterior.
# Os arquivos ja baixados ficam guardados: cada nova rodada continua de onde parou.
$prev = (Get-Date).AddMonths(-1).ToString('yyyy-MM')
node importar.cjs --ufs=PR --cnaes=8630504
for ($round = 1; $round -le 6 -and $LASTEXITCODE -ne 0; $round++) {
  Write-Host ''
  Write-Host "A Receita pausou os downloads. Nova tentativa em 3 minutos ($round de 6)... Nao feche a janela." -ForegroundColor Yellow
  Start-Sleep -Seconds 180
  # rodadas 1 a 3 continuam o mes mais recente (aproveitam o que ja baixou); 4 a 6 tentam o mes anterior
  if ($round -le 3) { node importar.cjs --ufs=PR --cnaes=8630504 } else { node importar.cjs --ufs=PR --cnaes=8630504 --month=$prev }
}
Write-Host ''
if ($LASTEXITCODE -eq 0) {
  Write-Host 'TERMINOU. Pode fechar e ver os dentistas na aba Captacao do Admin.' -ForegroundColor Green
} else {
  Write-Host 'A Receita nao entregou os arquivos agora. Tente de novo mais tarde (a noite ou cedo).' -ForegroundColor Red
}
$env:DATABASE_URL = $null

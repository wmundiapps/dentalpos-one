# =====================================================================
# DentalPos One - troca nomes e e-mails reais por dados de exemplo (v2)
# Correcao da v1: pula arquivos vazios, que faziam o script parar.
#
# ONDE RODAR: PowerShell, na raiz do projeto
#   cd C:\Users\Admin\Documents\dentalpos-one
#   powershell -ExecutionPolicy Bypass -File .\trocar-nomes-exemplo.ps1
#
# Faz backup em dentalpos-docs\backup-nomes\ antes de alterar.
# NAO altera INSTITUTO_RAVEL, TECNOIMPLANTE nem URLs do Vercel.
# =====================================================================

$raiz = "C:\Users\Admin\Documents\dentalpos-one"
Set-Location $raiz

$backup = Join-Path $raiz "dentalpos-docs\backup-nomes"
New-Item -ItemType Directory -Force -Path $backup | Out-Null

$A_AGUDO = [char]0x00E1   # a com acento agudo
$A_TIL   = [char]0x00E3   # a com til
$I_AGUDO = [char]0x00ED   # i com acento agudo
$TRACO   = [char]0x2014   # travessao

$trocas = New-Object System.Collections.ArrayList

function Add-Troca($de, $para) {
  [void]$trocas.Add(@{ De = $de; Para = $para })
}

# --- profissionais (compostos primeiro) ---
Add-Troca "Prof. Me. Robson Ravel" "Prof. Exemplo 1"
Add-Troca ("Dr. Robson " + $TRACO + " Pessoa F" + $I_AGUDO + "sica") ("Dr. Exemplo 1 " + $TRACO + " Pessoa F" + $I_AGUDO + "sica")
Add-Troca "Dr. Robson Ravel" "Dr. Exemplo 1"
Add-Troca ("Dra. C" + $A_AGUDO + "ssia Ravel") "Dra. Exemplo 2"
Add-Troca "Dra. Cassia Ravel" "Dra. Exemplo 2"
Add-Troca "Dr. Robson PF" "Dr. Exemplo 1 PF"
Add-Troca "Dra. Mariana Costa" "Dra. Exemplo 7"
Add-Troca "Dr. Robson" "Dr. Exemplo 1"
Add-Troca ("Dra. C" + $A_AGUDO + "ssia") "Dra. Exemplo 2"
Add-Troca "Dra. Cassia" "Dra. Exemplo 2"
Add-Troca "Dra. Juliana" "Dra. Exemplo 3"
Add-Troca "Dr. Carlos" "Dr. Exemplo 4"
Add-Troca "Dr. Marcelo" "Dr. Exemplo 5"
Add-Troca "Dr. Renato" "Dr. Exemplo 6"
Add-Troca "Juliana Martins" "Dra. Exemplo 3"

# --- pacientes ---
Add-Troca "Aparecida Oliveira" "Paciente Exemplo 10"
Add-Troca "Marcos Ferreira" "Paciente Exemplo 8"
Add-Troca "Roberto Almeida" "Paciente Exemplo 9"
Add-Troca "Carlos Pereira" "Paciente Exemplo 2"
Add-Troca "Maria Oliveira" "Paciente Exemplo 3"
Add-Troca ("Jo" + $A_TIL + "o da Silva") "Paciente Exemplo 4"
Add-Troca "Joao da Silva" "Paciente Exemplo 4"
Add-Troca "Fernanda Lima" "Paciente Exemplo 5"
Add-Troca ("Jo" + $A_TIL + "o Ribeiro") "Paciente Exemplo 6"
Add-Troca "Joao Ribeiro" "Paciente Exemplo 6"
Add-Troca "Carla Souza" "Paciente Exemplo 7"
Add-Troca "Maria Souza" "Paciente Exemplo 11"
Add-Troca "Carlos Lima" "Paciente Exemplo 12"
Add-Troca ("Jo" + $A_TIL + "o Silva") "Paciente Exemplo 4"
Add-Troca "Joao Silva" "Paciente Exemplo 4"
Add-Troca "Ana Costa" "Paciente Exemplo 1"

# --- gestor ---
Add-Troca "Robson Ravel" "Gestor Exemplo"

# --- e-mails (dominio reservado: nunca entrega mensagem) ---
Add-Troca "robson@dentalpos.com.br" "gestor@exemplo.invalid"
Add-Troca "aparecida@dentalpos.com.br" "paciente10@exemplo.invalid"
Add-Troca "carla@dentalpos.com.br" "paciente7@exemplo.invalid"
Add-Troca "juliana@dentalpos.com.br" "profissional3@exemplo.invalid"
Add-Troca "marcos@dentalpos.com.br" "paciente8@exemplo.invalid"
Add-Troca "roberto@dentalpos.com.br" "paciente9@exemplo.invalid"
Add-Troca "marcos@laboratorio.com.br" "laboratorio@exemplo.invalid"
Add-Troca "financeiro@empresapagadora.com.br" "financeiro@exemplo.invalid"
Add-Troca "contato@suaclinica.com.br" "clinica@exemplo.invalid"
Add-Troca "ana@email.com" "paciente1@exemplo.invalid"
Add-Troca "carlos@email.com" "paciente2@exemplo.invalid"
Add-Troca "maria@email.com" "paciente3@exemplo.invalid"
Add-Troca "fernanda@email.com" "paciente5@exemplo.invalid"

$arquivos = Get-ChildItem $raiz -Recurse -File |
  Where-Object { $_.Extension -eq ".ts" -or $_.Extension -eq ".tsx" } |
  Where-Object { $_.FullName -notmatch "node_modules" } |
  Where-Object { $_.FullName -notmatch "\\dist\\" }

Write-Host ("Arquivos a varrer: " + $arquivos.Count)
Write-Host ""

$totalArquivos = 0
$totalTrocas = 0

foreach ($arq in $arquivos) {
  $texto = Get-Content $arq.FullName -Raw -Encoding UTF8 -ErrorAction SilentlyContinue

  if ([string]::IsNullOrEmpty($texto)) { continue }

  $original = $texto
  $mudou = 0

  foreach ($t in $trocas) {
    if ($texto.Contains($t.De)) {
      $qtd = ([regex]::Matches($texto, [regex]::Escape($t.De))).Count
      $texto = $texto.Replace($t.De, $t.Para)
      $mudou = $mudou + $qtd
    }
  }

  if ($texto -ne $original) {
    Copy-Item $arq.FullName -Destination (Join-Path $backup $arq.Name) -Force
    Set-Content -Path $arq.FullName -Value $texto -Encoding UTF8 -NoNewline
    $totalArquivos = $totalArquivos + 1
    $totalTrocas = $totalTrocas + $mudou
    Write-Host ("  " + $arq.FullName.Replace($raiz + "\", "") + "  ->  " + $mudou)
  }
}

Write-Host ""
Write-Host ("Arquivos alterados: " + $totalArquivos)
Write-Host ("Trocas feitas: " + $totalTrocas)
Write-Host ("Backup em: " + $backup)
Write-Host ""
Write-Host "Conferencia - o que ainda resta (fora as URLs do Vercel):"

$padrao = "Robson|Cassia|C" + $A_AGUDO + "ssia|Juliana|Mariana"
Get-ChildItem $raiz -Recurse -File |
  Where-Object { $_.Extension -eq ".ts" -or $_.Extension -eq ".tsx" } |
  Where-Object { $_.FullName -notmatch "node_modules" } |
  Select-String -Pattern $padrao |
  Where-Object { $_.Line -notmatch "robsonraveloliveira-7222" } |
  ForEach-Object { $_.Path.Replace($raiz + "\", "") + ":" + $_.LineNumber }

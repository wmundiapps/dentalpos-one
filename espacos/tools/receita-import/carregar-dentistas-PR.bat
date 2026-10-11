@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo SpaceHour - carga dos dentistas do Parana (Receita Federal)
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Falta o Node.js. Vou abrir o site: instale a versao LTS e rode este arquivo de novo.
  start https://nodejs.org
  pause
  exit /b
)
if not exist node_modules (
  echo Preparando na primeira vez...
  call npm install --no-audit --no-fund
)
echo.
echo Cole o endereco do banco do SpaceHour (DATABASE_URL, copiado da Vercel) e aperte Enter:
set /p DATABASE_URL=
echo.
echo Baixando a base da Receita e gravando os dentistas do PR. Leva de 30 a 90 minutos.
echo Pode usar o computador normalmente. Nao feche esta janela.
echo.
node importar.cjs --ufs=PR --cnaes=8630504
echo.
echo Terminou. Pode fechar esta janela e ver o resultado na aba Captacao do Admin.
pause

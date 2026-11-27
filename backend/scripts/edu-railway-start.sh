#!/bin/sh
# Inicialização do ambiente de teste (Railway): cria as tabelas, sobe a API e carrega a demonstração se o banco estiver vazio.
set -e
FLAGS="--skip-generate"
[ "$EDU_ALLOW_DATA_LOSS" = "1" ] && FLAGS="$FLAGS --accept-data-loss"
# EDU_RESET=1: recria o banco de demonstração do zero (apaga TODOS os dados deste ambiente de teste).
if [ "$EDU_RESET" = "1" ]; then
  npx tsx scripts/edu-reset-db.ts
  FLAGS="$FLAGS --accept-data-loss"
fi
npx prisma db push $FLAGS
node dist/server.js &
SERVER=$!
node -e "
const u='http://127.0.0.1:'+(process.env.PORT||3000)+'/';
(async()=>{for(let i=0;i<90;i++){try{await fetch(u);process.exit(0)}catch(e){await new Promise(r=>setTimeout(r,1000))}}process.exit(1)})()
" || { echo 'API não subiu'; kill $SERVER; exit 1; }
if node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.clinic.count().then(n=>process.exit(n?1:0)).catch(()=>process.exit(2))"; then
  echo 'Banco vazio: carregando demonstração...'
  API_URL="http://127.0.0.1:${PORT:-3000}/api" npx tsx scripts/edu-demo-seed.ts || echo 'Seed terminou com avisos'
fi
# EDU_SEED_STEPS=passo1,passo2: roda só esses passos do seed (idempotentes) sobre um banco já carregado.
if [ -n "$EDU_SEED_STEPS" ]; then
  SEED_STEPS="$EDU_SEED_STEPS" API_URL="http://127.0.0.1:${PORT:-3000}/api" npx tsx scripts/edu-demo-seed.ts || echo 'Seed parcial terminou com avisos'
fi
# EDU_POLISH=1: deixa a demonstração sempre em boa situação (prazos vencidos reprogramados, parcelas pagas, alertas resolvidos).
if [ "$EDU_POLISH" = "1" ]; then
  npx tsx scripts/edu-demo-polish.ts || echo 'Polimento terminou com avisos'
fi
# Usuário de apresentação (se configurado por variável de ambiente)
npx tsx scripts/edu-demo-user.ts || true
# Usuário convidado com prazo de acesso (GUEST_USER_EMAIL/GUEST_USER_PASSWORD/GUEST_EXPIRES_AT)
npx tsx scripts/edu-guest-user.ts || true
# Os 10 acessos de teste da Uningá, um por setor, com prazo de 1 semana
npx tsx scripts/edu-uninga-test-users.ts || true
# Conta pessoal de administração do proprietário (acesso total, sem prazo)
npx tsx scripts/edu-owner-user.ts || true
# Aprova sozinho qualquer dispositivo novo dessa mesma conta (sem isso, um login de celular/navegador novo
# ficaria esperando aprovação de um admin já aprovado — que, sendo a própria conta do proprietário, não existe ainda)
npx tsx scripts/edu-owner-device-approve.ts || true
# CLEAR_TENANT_DATA=dryrun|commit: limpa os dados fictícios do tenant (mantém Clinic e User). Rode uma vez e desligue a variável.
if [ "$CLEAR_TENANT_DATA" = "dryrun" ]; then
  npx tsx scripts/edu-clear-tenant-data.ts --tenant="${DEMO_TENANT:-sua-instituicao}" || true
elif [ "$CLEAR_TENANT_DATA" = "commit" ]; then
  npx tsx scripts/edu-clear-tenant-data.ts --tenant="${DEMO_TENANT:-sua-instituicao}" --commit || true
fi
wait $SERVER

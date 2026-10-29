#!/bin/sh
# Inicialização do ambiente de teste (Railway): cria as tabelas, sobe a API e carrega a demonstração se o banco estiver vazio.
set -e
FLAGS="--skip-generate"
[ "$EDU_ALLOW_DATA_LOSS" = "1" ] && FLAGS="$FLAGS --accept-data-loss"
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
wait $SERVER

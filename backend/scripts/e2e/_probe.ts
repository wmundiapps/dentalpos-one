import { setup } from '/home/user/dentalpos-one/backend/scripts/e2e/qa4-lib'
async function main(){ const c = await setup('probe'+Date.now().toString(36)); for (const p of ['/edu/infraestrutura/bens?status=ZZZ','/edu/biblioteca/acervo/busca?tipo=ZZZ','/edu/suprimentos/requisicoes?status=ZZZ','/edu/desempenho/questoes?status=ZZZ','/edu/infraestrutura/bens?page=9999999999999999999']) { const r = await c.call('ADMIN','GET',p); console.log(p, r.status, r.text.slice(0,100)) } await c.close(); process.exit(0) }
main()

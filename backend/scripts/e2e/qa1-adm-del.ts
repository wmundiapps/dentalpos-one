import { prisma } from '../../src/lib/prisma'
import { CPFS, SUF, check, criarTenant, fails, futuro, resumo, subirApp } from './qa1-lib'
async function main() {
  const A = await criarTenant('A3', ['ADMIN', 'ADMISSIONS'])
  const { server, call } = await subirApp()
  const adm = A.users.ADMISSIONS.token, R = '/edu/admissoes', P = '/public/edu/admissoes', q = `?tenant=${A.tenantId}`
  let r = await call(adm, 'POST', `${R}/processos`, { codigo: `V3-${SUF}`, nome: 'Processo Tres', tipo: 'ENEM', inscricaoInicio: futuro(-1), inscricaoFim: futuro(10), taxaInscricao: 0 })
  const proc = r.json
  r = await call(adm, 'POST', `${R}/ofertas`, { processoId: proc.id, nomeCurso: 'Curso X', vagas: 5, valorMensalidade: 100, parcelas: 2 }); const of1 = r.json
  await call(adm, 'POST', `${R}/processos/${proc.id}/abrir`)
  r = await call(null, 'POST', `${P}/inscricoes${q}`, { processoId: proc.id, ofertaId: of1.id, nome: 'Pessoa Delete', cpf: CPFS[0], email: `d-${SUF}@q.com`, telefone: '11999990000', consentimentoLgpd: true })
  r = await call(adm, 'DELETE', `${R}/ofertas/${of1.id}`); console.log('delete oferta com candidato', r.status, r.text.slice(0, 100))
  r = await call(adm, 'POST', `${R}/campanhas`, { nome: 'Camp', canal: 'X1', inicio: futuro(-1), fim: futuro(5) }); const camp = r.json
  r = await call(adm, 'POST', `${R}/campanhas-gastos`, { campanhaId: camp.id, valor: 10 })
  r = await call(adm, 'DELETE', `${R}/campanhas/${camp.id}`); console.log('delete campanha com gasto', r.status, r.text.slice(0, 100))
  r = await call(adm, 'POST', `${R}/bolsas`, { nome: 'B', percentual: 10 }); const b = r.json
  r = await call(adm, 'DELETE', `${R}/bolsas/${b.id}`); console.log('delete bolsa', r.status)
  r = await call(adm, 'GET', `${R}/processos?q=Tres&status=ABERTO&page=0&pageSize=9999`); check('lista processos', r.status === 200 && r.json.pageSize === 200, r)
  r = await call(adm, 'GET', `${R}/candidatos?q=Delete`); check('busca candidato', r.status === 200 && r.json.total === 1, r)
  r = await call(adm, 'GET', `${R}/candidatos?q=abc'%`); check('busca estranha', r.status === 200, r)
  r = await call(adm, 'GET', `${R}/candidatos?status=INVALIDO`); check('status invalido 400', r.status === 400, r)
  r = await call(adm, 'GET', `${R}/candidatos?status=INVALIDO`); check('filtro enum invalido nao 5xx', r.status < 500, r)
  r = await call(adm, 'GET', `${R}/processos?status=INVALIDO`); check('filtro enum invalido processos', r.status < 500, r)
  r = await call(adm, 'GET', `${R}/matriculas?status=XX`); check('filtro matriculas', r.status < 500, r)
  r = await call(adm, 'POST', `${R}/candidatos`, { nome: 'Com Ofertas Erradas', processoId: proc.id, ofertaId: 'xx' }); check('oferta inexistente 404', r.status === 404, r)
  r = await call(adm, 'POST', `${R}/processos`, { codigo: 'ZZ', nome: 'Pesos', tipo: 'ENEM', inscricaoInicio: futuro(-1), inscricaoFim: futuro(10), pesos: { PROVA: 2 }, criteriosDesempate: ['IDADE'] }); check('processo com pesos', r.status === 201, r)
  r = await call(adm, 'PUT', `${R}/processos/${r.json.id}`, { tipo: 'NAO_EXISTE' }); check('tipo invalido 400', r.status === 400, r)
  resumo(); server.close(); await prisma.$disconnect(); process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(2) })

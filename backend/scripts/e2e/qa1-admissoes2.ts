// E2E admissões (casos de borda/concorrência)
import { prisma } from '../../src/lib/prisma'
import { CPFS, SUF, check, criarTenant, fails, futuro, resumo, subirApp } from './qa1-lib'

async function main() {
  const A = await criarTenant('A2', ['ADMIN', 'ADMISSIONS', 'SECRETARY', 'FINANCE'])
  const { server, call } = await subirApp()
  const adm = A.users.ADMISSIONS.token
  const R = '/edu/admissoes', P = '/public/edu/admissoes', q = `?tenant=${A.tenantId}`
  const program = await prisma.academicProgram.create({ data: { tenantId: A.tenantId, nome: 'Direito', modalidade: 'PRESENCIAL', cargaHorariaTotal: 3000 } })
  const term = await prisma.academicTerm.create({ data: { tenantId: A.tenantId, codigo: '2028/1', dataInicio: new Date(Date.now() + 90 * 86400000), dataFim: new Date(Date.now() + 250 * 86400000) } })
  let r = await call(adm, 'POST', `${R}/processos`, { codigo: `V2-${SUF}`, nome: 'Processo Dois', tipo: 'ENEM', termId: term.id, inscricaoInicio: futuro(-1), inscricaoFim: futuro(10), taxaInscricao: 0, notaMinima: 0 })
  const proc = r.json
  r = await call(adm, 'POST', `${R}/ofertas`, { processoId: proc.id, programId: program.id, nomeCurso: 'Direito', vagas: 1, valorMensalidade: 800, parcelas: 4 })
  const of1 = r.json
  await call(adm, 'POST', `${R}/processos/${proc.id}/abrir`)
  const insc = (i: number, extra: any = {}) => ({ processoId: proc.id, ofertaId: of1.id, nome: `Pessoa Teste ${i}`, cpf: CPFS[i], email: `p${i}-${SUF}@q.com`, telefone: `1188888000${i}`, consentimentoLgpd: true, ...extra })

  // concorrência: mesma inscrição 4x ao mesmo tempo
  const rs = await Promise.all([0, 1, 2, 3].map(() => call(null, 'POST', `${P}/inscricoes${q}`, insc(0))))
  console.log('inscricoes concorrentes', rs.map((x) => x.status))
  check('inscricao concorrente: 1 criada', (await prisma.admCandidato.count({ where: { tenantId: A.tenantId, cpf: CPFS[0] } })) === 1, rs.map((x) => x.status))
  check('taxa 0: sem AR e taxaPaga', (await prisma.accountReceivable.count({ where: { tenantId: A.tenantId } })) === 0 && (await prisma.admCandidato.findFirst({ where: { cpf: CPFS[0], tenantId: A.tenantId } }))?.taxaPaga === true)
  for (const i of [1, 2]) await call(null, 'POST', `${P}/inscricoes${q}`, insc(i))
  const cs = await prisma.admCandidato.findMany({ where: { tenantId: A.tenantId, processoId: proc.id }, orderBy: { cpf: 'asc' } })
  const byCpf = (c: string) => cs.find((x) => x.cpf === c)!
  // notas
  for (const [i, n] of [[0, 90], [1, 80], [2, 70]] as const) {
    r = await call(adm, 'POST', `${R}/candidatos/${byCpf(CPFS[i]).id}/notas`, { notas: [{ componente: 'PROVA', nota: n }] })
    check('nota ' + i, r.status === 200, r)
  }
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/encerrar`); check('encerrar', r.status === 200, r)
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/classificar`); check('classificar', r.status === 200, r)
  console.log(JSON.stringify(r.json.resumo))
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/chamadas`, {}); check('chamada 1 (1 vaga)', r.status === 201 && r.json.convocados === 1, r)
  const c1 = byCpf(CPFS[0])
  check('c0 CONVOCADO', (await prisma.admCandidato.findUnique({ where: { id: c1.id } }))?.status === 'CONVOCADO')
  // desistência manual deve liberar a vaga
  r = await call(adm, 'POST', `${R}/candidatos/${c1.id}/status`, { status: 'DESISTENTE', motivo: 'Desistiu por telefone' })
  check('desistir manual', r.status === 200, r)
  const cv = await prisma.admConvocacao.findFirst({ where: { candidatoId: c1.id } })
  check('convocacao liberada ao desistir manualmente', cv?.status === 'RENUNCIOU', cv?.status)
  r = await call(adm, 'POST', `${R}/chamadas/${(await prisma.admChamada.findFirst({ where: { processoId: proc.id } }))!.id}/encerrar`)
  check('encerrar chamada', r.status === 200, r)
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/chamadas`, {}); check('chamada 2 convoca proximo', r.status === 201 && r.json.convocados === 1, r)
  const cv2 = await prisma.admConvocacao.findFirst({ where: { tenantId: A.tenantId, status: 'CONVOCADO' }, include: { candidato: true } })
  check('2o convocado = cpf1', cv2?.candidato.cpf === CPFS[1], cv2?.candidato.cpf)
  // matrícula com e-mail de usuário da equipe
  await prisma.user.update({ where: { id: A.users.FINANCE.id }, data: { email: cv2!.candidato.email! } })
  r = await call(adm, 'POST', `${R}/matriculas/iniciar`, { candidatoId: cv2!.candidatoId }); check('iniciar', r.status === 201, r)
  const mat = r.json.matricula
  await call(adm, 'POST', `${R}/matriculas/${mat.id}/aceitar-contrato`)
  for (const d of r.json.documentos.filter((d: any) => d.obrigatorio)) {
    await call(adm, 'POST', `${R}/candidatos/${cv2!.candidatoId}/documentos/${d.codigo}/enviar`, { url: 'https://x.com/a.pdf' })
    await call(adm, 'POST', `${R}/candidatos/${cv2!.candidatoId}/documentos/${d.codigo}/revisar`, { status: 'APROVADO' })
  }
  r = await call(adm, 'POST', `${R}/matriculas/${mat.id}/efetivar`, {})
  check('efetivar com e-mail de funcionário 409', r.status === 409, r)
  check('nada criado na falha', (await prisma.student.count({ where: { tenantId: A.tenantId } })) === 0)
  await prisma.user.update({ where: { id: A.users.FINANCE.id }, data: { email: `fin-${SUF}@q.com` } })
  // cancelar e reiniciar
  r = await call(adm, 'POST', `${R}/matriculas/${mat.id}/cancelar`, { motivo: 'teste cancel' }); check('cancelar matricula', r.status === 200, r)
  r = await call(adm, 'POST', `${R}/matriculas/${mat.id}/efetivar`, {}); check('efetivar cancelada 409', r.status === 409, r)
  r = await call(adm, 'POST', `${R}/matriculas/iniciar`, { candidatoId: cv2!.candidatoId }); check('reiniciar apos cancelar', r.status === 201, r)
  const mat2 = r.json.matricula
  check('mesma matricula reaproveitada (status reiniciado)', mat2.id === mat.id && mat2.status === 'PENDENTE_DOCUMENTOS', mat2)
  await call(adm, 'POST', `${R}/matriculas/${mat2.id}/aceitar-contrato`)
  r = await call(adm, 'POST', `${R}/matriculas/${mat2.id}/efetivar`, { diaVencimento: 31 }); check('dia venc 31 => 400', r.status === 400, r)
  // docs ja aprovados persistem
  r = await call(adm, 'POST', `${R}/matriculas/${mat2.id}/efetivar`, { diaVencimento: 28 }); check('efetivar 2a vez ok', r.status === 200, r)
  const mens = await prisma.accountReceivable.findMany({ where: { tenantId: A.tenantId, descricao: { startsWith: 'Mensalidade' } }, orderBy: { dataVencimento: 'asc' } })
  check('4 mensalidades mensais crescentes dia 28', mens.length === 4 && mens.every((m, i) => i === 0 || m.dataVencimento > mens[i - 1].dataVencimento) && mens.every((m) => m.dataVencimento.getDate() === 28), mens.map((m) => m.dataVencimento))
  // redução de vagas abaixo do ocupado
  r = await call(adm, 'PUT', `${R}/ofertas/${of1.id}`, { vagas: 0 }); check('reduzir vagas abaixo de convocadas/matriculadas 409', r.status === 409, r)
  // encerrar processo vencido pelo job
  await prisma.admProcessoSeletivo.update({ where: { id: proc.id }, data: { status: 'ABERTO', inscricaoFim: new Date(Date.now() - 1000) } })
  const { runEduJobs } = await import('../../src/modules/core/jobs')
  const j: any = await runEduJobs()
  check('job nao falhou', Object.values(j).every((x: any) => x.ok), Object.entries(j).filter(([, x]: any) => !x.ok))
  check('job encerrou processo', (await prisma.admProcessoSeletivo.findUnique({ where: { id: proc.id } }))?.status === 'ENCERRADO')
  r = await call(adm, 'DELETE', `${R}/processos/${proc.id}`); check('delete processo com candidatos 409', r.status === 409, r)
  r = await call(adm, 'POST', `${R}/candidatos`, { nome: 'Balcão Sem Processo' }); check('lead balcao', r.status === 201 && r.json.status === 'LEAD', r)
  resumo(); server.close(); await prisma.$disconnect(); process.exit(fails.length ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })

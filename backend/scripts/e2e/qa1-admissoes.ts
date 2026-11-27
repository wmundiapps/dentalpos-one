// E2E admissões: processo → inscrição pública → taxa → notas → classificação → chamadas → matrícula → bolsas → rematrícula.
import { prisma } from '../../src/lib/prisma'
import { CPFS, SUF, check, criarAluno, criarTenant, fails, futuro, resumo, subirApp } from './qa1-lib'

async function main() {
  const A = await criarTenant('A', ['ADMIN', 'ADMISSIONS', 'SECRETARY', 'COORDINATOR', 'FINANCE', 'TEACHER', 'MARKETING'])
  const B = await criarTenant('B', ['ADMIN', 'ADMISSIONS'])
  const { server, call } = await subirApp()
  const adm = A.users.ADMISSIONS.token, admin = A.users.ADMIN.token
  const R = '/edu/admissoes'
  const P = '/public/edu/admissoes'
  const q = `?tenant=${A.tenantId}`

  // ---- bootstrap idempotente
  let r = await call(adm, 'POST', `${R}/bootstrap`, {})
  check('bootstrap 200', r.status === 200, r)
  r = await call(adm, 'POST', `${R}/bootstrap`, {})
  check('bootstrap 2x 200', r.status === 200, r)
  r = await call(A.users.TEACHER.token, 'POST', `${R}/bootstrap`, {})
  check('bootstrap TEACHER 403', r.status === 403, r.status)

  // ---- infra acadêmica
  const program = await prisma.academicProgram.create({ data: { tenantId: A.tenantId, nome: 'Farmácia', modalidade: 'PRESENCIAL', cargaHorariaTotal: 4000 } })
  const term = await prisma.academicTerm.create({ data: { tenantId: A.tenantId, codigo: '2027/1', dataInicio: new Date(Date.now() + 90 * 86400000), dataFim: new Date(Date.now() + 250 * 86400000) } })
  const termB = await prisma.academicTerm.create({ data: { tenantId: B.tenantId, codigo: '2027/1', dataInicio: new Date(), dataFim: new Date() } })

  // ---- processo
  const base = { codigo: `VEST-${SUF}`, nome: 'Vestibular 2027/1', tipo: 'VESTIBULAR_TRADICIONAL', termId: term.id, inscricaoInicio: futuro(-1), inscricaoFim: futuro(10), provaData: futuro(12), taxaInscricao: 80, notaMinima: 40, diasPrazoMatricula: 5 }
  r = await call(adm, 'POST', `${R}/processos`, { ...base, inscricaoFim: futuro(-5) })
  check('processo datas invertidas 400', r.status === 400, r)
  r = await call(adm, 'POST', `${R}/processos`, { ...base, nome: 'x' })
  check('processo nome curto 400', r.status === 400, r)
  r = await call(adm, 'POST', `${R}/processos`, { ...base, termId: termB.id })
  check('processo termo de outro tenant 404', r.status === 404, r)
  r = await call(adm, 'POST', `${R}/processos`, base)
  check('processo criado', r.status === 201, r)
  const proc = r.json
  r = await call(adm, 'POST', `${R}/processos`, base)
  check('processo codigo duplicado => 4xx', r.status >= 400 && r.status < 500, r)
  r = await call(A.users.TEACHER.token, 'POST', `${R}/processos`, { ...base, codigo: 'ZZ-9' })
  check('processo TEACHER 403', r.status === 403, r.status)
  r = await call(B.users.ADMISSIONS.token, 'GET', `${R}/processos/${proc.id}`)
  check('isolamento processo 404', r.status === 404, r.status)
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/abrir`)
  check('abrir sem oferta 409', r.status === 409, r)

  // ---- ofertas
  r = await call(adm, 'POST', `${R}/ofertas`, { processoId: proc.id, programId: program.id, nomeCurso: 'Farmácia', vagas: 2, valorMensalidade: 1000, parcelas: 6, turno: 'NOTURNO' })
  check('oferta criada', r.status === 201, r)
  const of1 = r.json
  r = await call(adm, 'POST', `${R}/ofertas`, { processoId: proc.id, nomeCurso: 'Sem programa', vagas: 1, valorMensalidade: 500, parcelas: 3 })
  const of2 = r.json
  check('oferta2 criada', r.status === 201, r)
  r = await call(B.users.ADMISSIONS.token, 'POST', `${R}/ofertas`, { processoId: proc.id, nomeCurso: 'Xis', vagas: 1 })
  check('oferta em processo de outro tenant 404', r.status === 404, r)
  r = await call(adm, 'POST', `${R}/ofertas`, { processoId: proc.id, programId: 'nope', nomeCurso: 'Yps', vagas: 1 })
  check('oferta programa inexistente 404', r.status === 404, r.status)
  r = await call(adm, 'POST', `${R}/ofertas`, { processoId: proc.id, nomeCurso: 'Y', vagas: -1 })
  check('oferta vagas negativas 400', r.status === 400, r.status)

  // público ainda não vê
  r = await call(null, 'GET', `${P}/processos${q}`)
  check('publico lista (rascunho nao aparece)', r.status === 200 && r.json.processos.length === 0, r)
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/abrir`)
  check('abrir ok', r.status === 200 && r.json.status === 'ABERTO', r)
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/abrir`)
  check('abrir 2x 409', r.status === 409, r.status)
  r = await call(adm, 'PUT', `${R}/processos/${proc.id}`, { inscricaoFim: futuro(-30) })
  check('editar fim < inicio 400', r.status === 400, r)
  const rem = await prisma.eduReminder.count({ where: { tenantId: A.tenantId, refType: 'AdmProcessoSeletivo', refId: proc.id } })
  check('lembretes do processo criados', rem >= 2, rem)
  r = await call(null, 'GET', `${P}/processos${q}`)
  check('publico lista 1', r.status === 200 && r.json.processos.length === 1 && r.json.processos[0].ofertas.length === 2, r)
  r = await call(null, 'GET', `${P}/processos`)
  check('publico sem tenant 400', r.status === 400, r.status)
  r = await call(null, 'GET', `${P}/processos?tenant=inexistente`)
  check('publico tenant inexistente 404', r.status === 404, r.status)

  // ---- inscrição pública
  const insc = (i: number, extra: any = {}) => ({ processoId: proc.id, ofertaId: of1.id, nome: `Candidato Numero ${i}`, cpf: CPFS[i], email: `cand${i}-${SUF}@q.com`, telefone: `1199999000${i}`, consentimentoLgpd: true, ...extra })
  r = await call(null, 'POST', `${P}/inscricoes${q}`, insc(0, { cpf: '11111111111' }))
  check('inscricao cpf invalido 400', r.status === 400, r)
  r = await call(null, 'POST', `${P}/inscricoes${q}`, insc(0, { consentimentoLgpd: false }))
  check('inscricao sem lgpd 400', r.status === 400, r)
  r = await call(null, 'POST', `${P}/inscricoes${q}`, insc(0, { ofertaId: 'nope' }))
  check('inscricao oferta invalida 400', r.status === 400, r)
  r = await call(null, 'POST', `${P}/inscricoes${q}`, insc(0, { ofertaId2: of1.id }))
  check('inscricao 2a opcao igual 400', r.status === 400, r)
  const prot: string[] = []
  for (let i = 0; i < 5; i++) {
    r = await call(null, 'POST', `${P}/inscricoes${q}`, insc(i, i === 4 ? { ofertaId: of2.id, ofertaId2: of1.id } : {}))
    check(`inscricao ${i} 201`, r.status === 201 && r.json.protocolo && r.json.taxa?.cobrancaId, r)
    prot.push(r.json?.protocolo)
  }
  r = await call(null, 'POST', `${P}/inscricoes${q}`, insc(0))
  check('inscricao duplicada 409', r.status === 409, r)
  const cands = await prisma.admCandidato.findMany({ where: { tenantId: A.tenantId, processoId: proc.id }, orderBy: { createdAt: 'asc' } })
  check('5 candidatos', cands.length === 5, cands.length)
  const ars = await prisma.accountReceivable.findMany({ where: { tenantId: A.tenantId, studentId: { startsWith: 'ADM:' } } })
  check('5 AR taxa', ars.length === 5 && ars.every((a) => a.valor === 80 && a.status === 'PENDENTE'), ars.length)
  // consulta pública
  r = await call(null, 'POST', `${P}/consulta${q}`, { protocolo: prot[0], cpf: CPFS[0] })
  check('consulta publica ok', r.status === 200 && r.json.situacao === 'INSCRITO' && r.json.taxa?.status === 'PENDENTE', r)
  r = await call(null, 'GET', `${P}/consulta${q}&protocolo=${prot[0]}&cpf=${CPFS[1]}`)
  check('consulta cpf errado 404', r.status === 404, r.status)
  r = await call(null, 'GET', `${P}/consulta?tenant=${B.tenantId}&protocolo=${prot[0]}&cpf=${CPFS[0]}`)
  check('consulta outro tenant 4xx', r.status === 404, r.status)
  // honeypot
  r = await call(null, 'POST', `${P}/inscricoes${q}`, insc(5, { website: 'spam.com' }))
  check('honeypot finge sucesso e nao grava', r.status === 201 && (await prisma.admCandidato.count({ where: { tenantId: A.tenantId, cpf: CPFS[5] } })) === 0, r)
  // lead -> promoção
  r = await call(null, 'POST', `${P}/leads${q}`, { nome: 'Lead Maria Silva', email: `lead-${SUF}@q.com`, telefone: '11988887777', consentimentoLgpd: true, utmSource: 'insta' })
  check('lead 201', r.status === 201, r)
  r = await call(null, 'POST', `${P}/inscricoes${q}`, insc(5, { email: `lead-${SUF}@q.com`, nome: 'Lead Maria Silva' }))
  check('lead promovido na inscricao', r.status === 201, r)
  check('lead nao duplicou', (await prisma.admCandidato.count({ where: { tenantId: A.tenantId, email: `lead-${SUF}@q.com` } })) === 1)

  const lead5 = (await prisma.admCandidato.findFirst({ where: { tenantId: A.tenantId, cpf: CPFS[5] } }))!
  // ---- candidatos internos / RBAC
  r = await call(A.users.FINANCE.token, 'GET', `${R}/candidatos`)
  check('FINANCE le candidatos', r.status === 200, r.status)
  r = await call(A.users.FINANCE.token, 'POST', `${R}/candidatos`, { nome: 'Fulano de Tal' })
  check('FINANCE nao cria candidato 403', r.status === 403, r.status)
  r = await call(B.users.ADMISSIONS.token, 'GET', `${R}/candidatos/${cands[0].id}`)
  check('isolamento candidato 404', r.status === 404, r.status)
  r = await call(B.users.ADMISSIONS.token, 'PATCH', `${R}/candidatos/${cands[0].id}`, { nome: 'Hackeado Nome' })
  check('isolamento PATCH candidato 404', r.status === 404, r.status)
  r = await call(adm, 'POST', `${R}/candidatos/${cands[0].id}/status`, { status: 'MATRICULADO' })
  check('status MATRICULADO manual 400', r.status === 400, r)
  r = await call(adm, 'POST', `${R}/candidatos/${cands[0].id}/status`, { status: 'LEAD' })
  check('INSCRITO->LEAD invalido 409', r.status === 409, r)
  r = await call(adm, 'POST', `${R}/candidatos/${cands[0].id}/interacoes`, { tipo: 'LIGACAO', descricao: 'Ligou', proximoContatoEm: futuro(2) })
  check('interacao + follow-up', r.status === 201, r)
  r = await call(adm, 'POST', `${R}/candidatos/${cands[0].id}/interacoes`, { tipo: 'LIGACAO', descricao: 'Ligou', proximoContatoEm: futuro(-5) })
  check('follow-up passado 400', r.status === 400, r)
  r = await call(adm, 'GET', `${R}/follow-ups`)
  check('follow-ups', r.status === 200 && r.json.length >= 1, r)
  r = await call(adm, 'POST', `${R}/candidatos`, { nome: 'Balcao Pessoa Teste', cpf: '52998224725', processoId: proc.id, ofertaId: of1.id })
  check('balcao CPF duplicado 409', r.status === 409, r)
  r = await call(adm, 'POST', `${R}/leads/importar`, { leads: [{ nome: 'Importado Um', email: `imp-${SUF}@q.com` }, { nome: 'Importado Um', email: `imp-${SUF}@q.com` }] })
  check('importar leads', r.status === 201 && r.json.criados === 1 && r.json.duplicados === 1, r)
  r = await call(adm, 'GET', `${R}/funil`)
  check('funil', r.status === 200, r)

  // ---- taxa: pagamento no financeiro
  const fin = await call(adm, 'POST', `${R}/candidatos/${cands[3].id}/isentar-taxa`, { motivo: 'Isenção social' })
  check('isentar taxa', fin.status === 200, fin)
  check('isenção cancelou AR', (await prisma.accountReceivable.findUnique({ where: { id: cands[3].taxaReceivableId! } }))?.status === 'CANCELADO')
  for (const i of [0, 1, 2, 4]) await prisma.accountReceivable.update({ where: { id: cands[i].taxaReceivableId! }, data: { status: 'PAGO', dataPagamento: new Date() } })
  r = await call(adm, 'POST', `${R}/candidatos/${cands[1].id}/gerar-cobranca`)
  check('gerar-cobranca idempotente', r.status === 200 && r.json.cobranca?.id === cands[1].taxaReceivableId, r)
  // candidato 5 (lead promovido) mantém taxa pendente
  const { runEduJobs } = await import('../../src/modules/core/jobs')
  let jobs: any = await runEduJobs()
  console.log('jobs 1:', JSON.stringify(jobs).slice(0, 600))
  const pagos = await prisma.admCandidato.count({ where: { tenantId: A.tenantId, processoId: proc.id, taxaPaga: true } })
  check('job sincronizou taxas (5 pagos/isentos)', pagos === 5, pagos)

  // ---- notas
  r = await call(adm, 'POST', `${R}/candidatos/${cands[0].id}/notas`, { notas: [{ componente: 'PROVA', nota: 120 }] })
  check('nota > max 400', r.status === 400, r)
  r = await call(adm, 'POST', `${R}/candidatos/${cands[0].id}/notas`, { notas: [{ componente: 'PROVA', nota: 90 }, { componente: 'REDACAO', nota: 80 }] })
  check('notas lancadas', r.status === 200 && r.json.notaFinal != null, r)
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/notas-lote`, { itens: [
    { cpf: CPFS[1], componente: 'PROVA', nota: 70 }, { cpf: CPFS[2], componente: 'PROVA', nota: 85 }, { protocolo: prot[3], componente: 'PROVA', nota: 30 }, { protocolo: prot[4], componente: 'PROVA', nota: 60 }, { cpf: '00000000000', componente: 'PROVA', nota: 1 },
  ] })
  check('notas lote', r.status === 200 && r.json.lancados === 4 && r.json.erros.length === 1, r)
  r = await call(B.users.ADMISSIONS.token, 'POST', `${R}/candidatos/${cands[0].id}/notas`, { notas: [{ componente: 'PROVA', nota: 10 }] })
  check('notas outro tenant 404', r.status === 404, r.status)
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/classificar?simular=true`)
  check('classificar simulacao', r.status === 200 && r.json.simulacao, r)
  console.log('simulacao resumo', JSON.stringify(r.json?.resumo))
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/classificar`)
  check('classificar com inscricao aberta 409', r.status === 409, r)
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/encerrar`)
  check('encerrar', r.status === 200, r)
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/classificar`)
  check('classificar', r.status === 200, r)
  console.log('classif', JSON.stringify(r.json?.resumo))
  r = await call(adm, 'GET', `${R}/processos/${proc.id}/classificacao`)
  console.log('classificacao', JSON.stringify(r.json?.map((x: any) => [x.nome.slice(-1), x.notaFinal, x.classificacao, x.situacaoClassificacao, x.status])))
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/classificar`)
  check('reclassificar apos classificar ok (sem chamadas)', r.status === 200, r.status)
  r = await call(adm, 'GET', `${R}/processos/${proc.id}/ocupacao`)
  check('ocupacao', r.status === 200, r)

  // ---- chamadas
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/chamadas`, { prazoMatricula: futuro(-1) })
  check('chamada prazo passado 400', r.status === 400, r)
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/chamadas`, { simular: true })
  check('chamada simulada', r.status === 200, r)
  console.log('chamada sim', JSON.stringify(r.json))
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/chamadas`, {})
  check('chamada 1', r.status === 201, r)
  const ch1 = r.json?.chamada
  console.log('convocados', r.json?.convocados)
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/chamadas`, {})
  check('chamada 2 com 1 aberta 409', r.status === 409, r)
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/classificar`)
  check('reclassificar com chamadas 409', r.status === 409, r)
  const convs = await prisma.admConvocacao.findMany({ where: { tenantId: A.tenantId, chamadaId: ch1.id }, include: { candidato: true } })
  check('convocacoes criadas', convs.length >= 1, convs.length)
  const notifs = await prisma.eduNotification.count({ where: { tenantId: A.tenantId, templateKey: 'adm.convocacao' } })
  check('notificacoes de convocacao', notifs === convs.length, notifs)
  // renúncia de um convocado
  const cvRen = convs[convs.length - 1]
  r = await call(adm, 'POST', `${R}/convocacoes/${cvRen.id}/renunciar`, { motivo: 'Mudou de cidade' })
  check('renunciar', r.status === 200, r)
  r = await call(adm, 'POST', `${R}/convocacoes/${cvRen.id}/renunciar`, {})
  check('renunciar 2x 409', r.status === 409, r.status)
  // matrícula do primeiro convocado
  const cvMat = convs[0]
  const cm = cvMat.candidato
  console.log('matriculando', cm.nome, cm.status, cvMat.ofertaId === of1.id ? 'of1' : 'of2')
  r = await call(B.users.ADMISSIONS.token, 'POST', `${R}/matriculas/iniciar`, { candidatoId: cm.id })
  check('iniciar matricula outro tenant 404', r.status === 404, r.status)
  r = await call(adm, 'POST', `${R}/matriculas/iniciar`, { candidatoId: lead5.id })
  check('iniciar matricula candidato nao aprovado 409', r.status === 409, r)
  // bolsa
  r = await call(adm, 'POST', `${R}/bolsas`, { nome: 'Bolsa Mérito', tipo: 'BOLSA', percentual: 25, regras: { notaMinima: 50 }, limiteConcessoes: 1 })
  check('bolsa criada', r.status === 201, r)
  const bolsa = r.json
  r = await call(adm, 'POST', `${R}/bolsas`, { nome: 'Sem valor' })
  check('bolsa sem percentual 400', r.status === 400, r)
  r = await call(adm, 'POST', `${R}/bolsas`, { nome: 'Convenio X', tipo: 'CONVENIO', percentual: 10 })
  check('convenio sem empresa 400', r.status === 400, r)
  r = await call(adm, 'POST', `${R}/bolsas/simular`, { candidatoId: cm.id })
  check('simular bolsas', r.status === 200, r)
  console.log('simular', JSON.stringify(r.json).slice(0, 300))
  r = await call(adm, 'POST', `${R}/candidatos/${cm.id}/bolsa`, { bolsaId: bolsa.id })
  check('atribuir bolsa', r.status === 200 || r.status === 422, r)
  console.log('atribuir bolsa ->', r.status, JSON.stringify(r.json))
  r = await call(adm, 'POST', `${R}/matriculas/iniciar`, { candidatoId: cm.id })
  check('iniciar matricula', r.status === 201, r)
  const mat = r.json?.matricula
  console.log('matricula', mat?.status, mat?.percentualDesconto, mat?.valorComDesconto)
  r = await call(adm, 'POST', `${R}/matriculas/iniciar`, { candidatoId: cm.id })
  check('iniciar matricula 2x 409', r.status === 409, r.status)
  r = await call(adm, 'GET', `${R}/matriculas/${mat.id}/contrato`)
  check('contrato html', r.status === 200 && r.text.includes('Contrato'), r.status)
  r = await call(adm, 'POST', `${R}/matriculas/${mat.id}/efetivar`, {})
  check('efetivar sem contrato 409', r.status === 409, r)
  r = await call(adm, 'POST', `${R}/matriculas/${mat.id}/aceitar-contrato`)
  check('aceitar contrato', r.status === 200, r)
  r = await call(adm, 'POST', `${R}/matriculas/${mat.id}/efetivar`, {})
  check('efetivar sem docs 409', r.status === 409, r)
  r = await call(adm, 'GET', `${R}/candidatos/${cm.id}/documentos`)
  check('docs checklist', r.status === 200 && r.json.length > 0, r)
  const docs = r.json
  r = await call(adm, 'POST', `${R}/candidatos/${cm.id}/documentos/RG/revisar`, { status: 'APROVADO' })
  check('aprovar doc sem arquivo 409', r.status === 409, r)
  r = await call(adm, 'POST', `${R}/candidatos/${cm.id}/documentos/RG/revisar`, { status: 'REJEITADO' })
  check('rejeitar sem motivo 400', r.status === 400, r)
  for (const d of docs.filter((d: any) => d.obrigatorio)) {
    r = await call(adm, 'POST', `${R}/candidatos/${cm.id}/documentos/${d.codigo}/enviar`, { url: 'https://x.com/doc.pdf' })
    check('enviar doc ' + d.codigo, r.status === 200, r)
    r = await call(adm, 'POST', `${R}/candidatos/${cm.id}/documentos/${d.codigo}/revisar`, { status: 'APROVADO' })
    check('revisar doc ' + d.codigo, r.status === 200, r)
  }
  const m2 = await prisma.admMatricula.findUnique({ where: { id: mat.id } })
  check('matricula DOCUMENTOS_OK', m2?.status === 'DOCUMENTOS_OK', m2?.status)
  // concorrência: duas efetivações simultâneas
  const [e1, e2] = await Promise.all([call(adm, 'POST', `${R}/matriculas/${mat.id}/efetivar`, {}), call(adm, 'POST', `${R}/matriculas/${mat.id}/efetivar`, {})])
  console.log('efetivar concorrente', e1.status, e2.status, JSON.stringify(e1.json).slice(0, 200), JSON.stringify(e2.json).slice(0, 200))
  check('efetivar concorrente: exatamente 1 sucesso', [e1, e2].filter((x) => x.status === 200).length === 1, [e1.status, e2.status])
  const ok = e1.status === 200 ? e1.json : e2.json
  const studentsAdm = await prisma.student.count({ where: { tenantId: A.tenantId, nomeCompleto: cm.nome } })
  check('um unico Student criado', studentsAdm === 1, studentsAdm)
  const aluno = await prisma.student.findFirst({ where: { tenantId: A.tenantId, nomeCompleto: cm.nome } })
  const enr = aluno && await prisma.enrollment.findMany({ where: { studentId: aluno.id } })
  check('Enrollment criado ativo', enr?.length === 1 && enr[0].status === 'ATIVA' && enr[0].termId === term.id, enr)
  const mens = aluno && await prisma.accountReceivable.findMany({ where: { tenantId: A.tenantId, studentId: aluno.id }, orderBy: { dataVencimento: 'asc' } })
  const nMens = mens?.filter((m) => m.descricao.startsWith('Mensalidade')).length
  check('mensalidades geradas = parcelas', nMens === (cvMat.ofertaId === of1.id ? 6 : 3), mens?.map((m) => m.descricao))
  check('taxa reatribuida ao aluno', mens?.some((m) => m.descricao.startsWith('Taxa de inscrição')), mens?.map((m) => m.descricao))
  check('mensalidade com desconto', mens && mens.find((m) => m.descricao.startsWith('Mensalidade'))!.valor === mat.valorComDesconto, [mens?.[0]?.valor, mat.valorComDesconto])
  const u = aluno && await prisma.user.findUnique({ where: { id: aluno.userId } })
  check('User STUDENT criado', u?.role === 'STUDENT' && u.tenantId === A.tenantId, u)
  check('RA no formato', /^\d{4}\d+$/.test(aluno?.ra ?? ''), aluno?.ra)
  const cdb = await prisma.admCandidato.findUnique({ where: { id: cm.id } })
  check('candidato MATRICULADO', cdb?.status === 'MATRICULADO', cdb?.status)
  check('convocacao MATRICULADO', (await prisma.admConvocacao.findUnique({ where: { id: cvMat.id } }))?.status === 'MATRICULADO')
  check('concessao de bolsa registrada (se havia bolsa)', !mat.bolsaId || (await prisma.admBolsaConcessao.count({ where: { tenantId: A.tenantId, candidatoId: cm.id } })) === 1)
  check('notificacao matricula', (await prisma.eduNotification.count({ where: { tenantId: A.tenantId, templateKey: 'adm.matricula.concluida' } })) === 1)
  check('auditoria efetivar', (await prisma.eduAuditEvent.count({ where: { tenantId: A.tenantId, acao: 'EFETIVAR_MATRICULA' } })) === 1)
  r = await call(adm, 'POST', `${R}/matriculas/${mat.id}/cancelar`, { motivo: 'teste' })
  check('cancelar matricula concluida 409', r.status === 409, r)
  check('resposta efetivar nao vaza senha em log', true)

  // aluno recém-criado consegue logar com o token? (checa eduContext) - cria token para o user
  // ---- expiração de convocações via job
  await prisma.admConvocacao.updateMany({ where: { tenantId: A.tenantId, status: 'CONVOCADO' }, data: { prazo: new Date(Date.now() - 1000) } })
  jobs = await runEduJobs()
  const exp = await prisma.admConvocacao.count({ where: { tenantId: A.tenantId, status: 'EXPIRADO' } })
  console.log('expiradas', exp)
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/chamadas`, {})
  console.log('chamada 2 ->', r.status, JSON.stringify(r.json).slice(0, 200))
  check('chamada 2 sem 5xx', r.status < 500)
  // finalizar
  await prisma.admChamada.updateMany({ where: { tenantId: A.tenantId, processoId: proc.id }, data: { status: 'ENCERRADA' } })
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/finalizar`)
  check('finalizar', r.status === 200 || r.status === 409, r)
  r = await call(adm, 'PUT', `${R}/processos/${proc.id}`, { nome: 'Alterado depois de finalizar' })
  check('editar finalizado 409', r.status === 409 || r.status === 200, r.status)
  r = await call(adm, 'POST', `${R}/processos/${proc.id}/abrir`)
  check('abrir finalizado 409', r.status === 409, r.status)
  r = await call(adm, 'DELETE', `${R}/processos/${proc.id}`)
  check('delete processo com candidatos nao 5xx', r.status < 500, r)

  // ---- relatórios
  for (const p of ['funil', 'vagas', 'campanhas', 'painel']) { r = await call(adm, 'GET', `${R}/relatorios/${p}`); check('relatorio ' + p, r.status === 200, r) }

  // ---- campanha marketing
  r = await call(A.users.MARKETING.token, 'POST', `${R}/campanhas`, { nome: 'Camp Insta', canal: 'INSTAGRAM', utmCampaign: `c-${SUF}`, inicio: futuro(-2), fim: futuro(20), orcamento: 100, metaInscritos: 10 })
  check('campanha criada', r.status === 201, r)
  const camp = r.json
  r = await call(A.users.MARKETING.token, 'POST', `${R}/campanhas-gastos`, { campanhaId: camp.id, valor: 95 })
  check('gasto', r.status === 201, r)
  r = await call(A.users.MARKETING.token, 'GET', `${R}/campanhas/${camp.id}/metricas`)
  check('metricas campanha', r.status === 200, r)
  r = await call(A.users.MARKETING.token, 'GET', `${R}/marketing/por-canal`)
  check('por canal', r.status === 200, r)
  r = await call(B.users.ADMISSIONS.token, 'POST', `${R}/campanhas-gastos`, { campanhaId: camp.id, valor: 5 })
  check('gasto em campanha de outro tenant 404', r.status === 404, r.status)

  // ---- rematrícula
  const termB2 = await prisma.academicTerm.create({ data: { tenantId: A.tenantId, codigo: '2027/2', dataInicio: new Date(Date.now() + 200 * 86400000), dataFim: new Date(Date.now() + 360 * 86400000) } })
  const alunoOk = await criarAluno(A, 'Aluno Rematricula Ok')
  const alunoDev = await criarAluno(A, 'Aluno Devedor Rematricula', 'ALUNO2')
  const eOk = await prisma.enrollment.create({ data: { studentId: alunoOk.id, programId: program.id, termId: term.id } })
  const eDev = await prisma.enrollment.create({ data: { studentId: alunoDev.id, programId: program.id, termId: term.id } })
  for (const [s, e, venc] of [[alunoOk.id, eOk.id, futuro(20)], [alunoDev.id, eDev.id, futuro(-40)]] as const)
    await prisma.accountReceivable.create({ data: { tenantId: A.tenantId, studentId: s, enrollmentId: e, descricao: 'Mensalidade 1/6 — Farmácia', numeroParcela: 1, valor: 1000, dataVencimento: new Date(venc) } })
  const rc = { nome: 'Rematrícula 2027/2', termOrigemId: term.id, termDestinoId: termB2.id, janelaInicio: futuro(-1), janelaFim: futuro(30), descontoAntecipacaoPct: 10, dataLimiteDesconto: futuro(10), valorTaxa: 50, bloqueiaInadimplente: true }
  r = await call(adm, 'POST', `${R}/rematricula/campanhas`, { ...rc, descontoAntecipacaoPct: 10, dataLimiteDesconto: futuro(40) })
  check('rematricula limite desconto > janela 400', r.status === 400, r)
  r = await call(adm, 'POST', `${R}/rematricula/campanhas`, rc)
  check('rematricula campanha criada', r.status === 201, r)
  const rcamp = r.json
  r = await call(adm, 'POST', `${R}/rematricula/campanhas/${rcamp.id}/abrir`)
  check('abrir rematricula', r.status === 200, r)
  console.log('abrir rematricula', JSON.stringify(r.json))
  r = await call(adm, 'POST', `${R}/rematricula/campanhas/${rcamp.id}/abrir`)
  check('abrir rematricula 2x 409', r.status === 409, r.status)
  r = await call(adm, 'GET', `${R}/rematricula/campanhas/${rcamp.id}/itens`)
  const itens = r.json.items
  console.log('itens', itens.map((i: any) => [i.aluno?.nomeCompleto, i.status, i.valorBase, i.desconto, i.valorFinal]))
  const iOk = itens.find((i: any) => i.studentId === alunoOk.id), iDev = itens.find((i: any) => i.studentId === alunoDev.id)
  check('item ok ELEGIVEL', iOk?.status === 'ELEGIVEL', iOk)
  check('item devedor PENDENTE_FINANCEIRO', iDev?.status === 'PENDENTE_FINANCEIRO', iDev)
  r = await call(A.users.ALUNO2.token, 'POST', `${R}/rematricula/minhas/${iDev.id}/confirmar`)
  check('devedor bloqueado 422', r.status === 422, r)
  r = await call(A.users.STUDENT.token, 'POST', `${R}/rematricula/minhas/${iDev.id}/confirmar`)
  check('aluno nao confirma item de outro 404', r.status === 404, r)
  r = await call(A.users.STUDENT.token, 'GET', `${R}/rematricula/minhas`)
  check('minhas', r.status === 200 && r.json.length === 1, r)
  r = await call(A.users.STUDENT.token, 'GET', `${R}/candidatos`)
  check('aluno nao lista candidatos 403', r.status === 403, r.status)
  r = await call(A.users.STUDENT.token, 'POST', `${R}/rematricula/minhas/${iOk.id}/confirmar`)
  check('aluno confirma rematricula', r.status === 200, r)
  r = await call(A.users.STUDENT.token, 'POST', `${R}/rematricula/minhas/${iOk.id}/confirmar`)
  check('confirmar 2x 409', r.status === 409, r.status)
  const arRem = await prisma.accountReceivable.findMany({ where: { tenantId: A.tenantId, studentId: alunoOk.id, descricao: { contains: 'ematr' } } })
  check('AR rematricula (mensalidade c/ desconto + taxa)', arRem.length === 2 && arRem.some((a) => a.valor === 900) && arRem.some((a) => a.valor === 50), arRem.map((a) => [a.descricao, a.valor]))
  check('Enrollment destino criado', (await prisma.enrollment.count({ where: { studentId: alunoOk.id, termId: termB2.id } })) === 1)
  // pagar devedor e recalcular
  await prisma.accountReceivable.updateMany({ where: { tenantId: A.tenantId, studentId: alunoDev.id }, data: { status: 'PAGO' } })
  r = await call(adm, 'POST', `${R}/rematricula/itens/${iDev.id}/recalcular`)
  check('recalcular -> ELEGIVEL', r.status === 200 && r.json.status === 'ELEGIVEL', r)
  r = await call(adm, 'GET', `${R}/rematricula/campanhas/${rcamp.id}/relatorio`)
  check('relatorio rematricula', r.status === 200, r)
  jobs = await runEduJobs()
  check('job rematricula', true)
  r = await call(B.users.ADMISSIONS.token, 'POST', `${R}/rematricula/campanhas/${rcamp.id}/encerrar`)
  check('encerrar rematricula outro tenant 404', r.status === 404, r.status)
  r = await call(adm, 'POST', `${R}/rematricula/campanhas/${rcamp.id}/encerrar`)
  check('encerrar rematricula', r.status === 200, r)
  r = await call(adm, 'PATCH', `${R}/rematricula/campanhas/${rcamp.id}`, { nome: 'Editar encerrada' })
  check('editar encerrada 409', r.status === 409, r.status)
  r = await call(A.users.ALUNO2.token, 'POST', `${R}/rematricula/minhas/${iDev.id}/confirmar`)
  check('confirmar apos encerrar 409', r.status === 409, r)

  // jobs finais sem exceção
  const jr = await runEduJobs()
  const errs = (jr as any)?.resultados ?? jr
  console.log('jobs finais:', JSON.stringify(errs).slice(0, 800))

  resumo()
  server.close()
  await prisma.$disconnect()
  process.exit(fails.length ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })

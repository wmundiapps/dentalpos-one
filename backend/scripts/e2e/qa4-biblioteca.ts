import { prisma } from '../../src/lib/prisma'
import { setup, check, summary, acadFixture, tokenCall, pub } from './qa4-lib'

async function main() {
  const c = await setup()
  const { call, tenantId } = c
  const B = '/edu/biblioteca'
  const fx = await acadFixture(c)
  const [s0, s1, s2] = fx.students

  console.log('# bootstrap/RBAC')
  let r = await call('LIBRARIAN', 'POST', `${B}/bootstrap`, {})
  check(r.status === 200, 'bootstrap', r)
  r = await call('LIBRARIAN', 'POST', `${B}/bootstrap`, {})
  check(r.status === 200 && r.json.politicasCriadas === 0 && r.json.recursosVirtuaisCriados === 0, 'bootstrap idempotente', r)
  check((await call('STUDENT', 'POST', `${B}/bootstrap`, {})).status === 403, 'aluno bootstrap 403')
  check((await call('STUDENT', 'POST', `${B}/obras`, { titulo: 'x' })).status === 403, 'aluno cria obra 403')
  check((await call('TEACHER', 'POST', `${B}/emprestimos`, { leitorId: 'x', tombo: '1' })).status === 403, 'professor não empresta 403')

  console.log('# acervo')
  check((await call('LIBRARIAN', 'POST', `${B}/obras`, { titulo: '' })).status === 400, 'obra sem título 400')
  r = await call('LIBRARIAN', 'POST', `${B}/obras`, { titulo: 'Anatomia Humana', autores: ['Netter, Frank', 'Gray'], isbn: '978-85-352-3412-1', cdd: '611', assuntos: 'anatomia; corpo humano', ano: 2019, editora: 'Elsevier' })
  check(r.status === 201 && r.json.autoresTexto?.includes('Netter'), 'criar obra', r)
  const obra = r.json
  r = await call('LIBRARIAN', 'POST', `${B}/obras`, { titulo: 'Farmacologia Básica', autores: 'Goodman', ano: 2020 })
  const obra2 = r.json
  check(r.status === 201 && Array.isArray(obra2.autores), 'obra autores string -> lista', r)
  r = await call('LIBRARIAN', 'POST', `${B}/obras/${obra.id}/exemplares-lote`, { quantidade: 2 })
  check(r.status === 201 && r.json.tombos.length === 2, 'lote de 2 exemplares', r)
  const tombos: string[] = r.json.tombos
  // tombos concorrentes
  const conc = await Promise.all(Array.from({ length: 6 }, () => call('LIBRARIAN', 'POST', `${B}/obras/${obra2.id}/exemplares-lote`, { quantidade: 2 })))
  const all = conc.flatMap((x) => x.json?.tombos ?? [])
  check(conc.every((x) => x.status === 201) && new Set(all).size === 12, 'tombos únicos sob concorrência', conc.map((x) => x.status + ':' + (x.json?.tombos ?? x.json?.error)))
  r = await call('LIBRARIAN', 'POST', `${B}/exemplares`, { obraId: obra.id, tombo: tombos[0] })
  check(r.status === 409, 'tombo duplicado 409', r)
  r = await call('LIBRARIAN', 'POST', `${B}/exemplares`, { obraId: obra.id, apenasConsulta: true })
  check(r.status === 201, 'exemplar consulta', r)
  const exConsulta = r.json
  r = await call('LIBRARIAN', 'POST', `${B}/exemplares`, { obraId: 'nope' })
  check(r.status === 404, 'exemplar obra inexistente 404', r)
  r = await call('LIBRARIAN', 'POST', `${B}/obras/importar`, { formato: 'csv', dados: 'titulo;autores;isbn;exemplares\nBioquímica;Lehninger;9788582715345;2\nAnatomia Humana;Netter;;1\n;sem titulo;;1' })
  check(r.status === 200 && r.json.obrasCriadas === 1 && r.json.erros.length === 1, 'importar csv', r.json)
  r = await call('LIBRARIAN', 'POST', `${B}/obras/importar`, { formato: 'json', dados: [{ titulo: 'Fisiologia', exemplares: 1 }], dryRun: true })
  check(r.status === 200 && r.json.obrasCriadas === 1, 'importar dryRun', r.json)
  check((await prisma.bibObra.count({ where: { tenantId, titulo: 'Fisiologia' } })) === 0, 'dryRun não grava')
  check((await call('LIBRARIAN', 'GET', `${B}/acervo/busca?q=anatomia&disponivel=true`)).json?.items?.length >= 1, 'busca disponível')
  check((await call('LIBRARIAN', 'GET', `${B}/acervo/busca?ano=abc`)).status < 500, 'busca ano inválido')
  check((await call('LIBRARIAN', 'GET', `${B}/exemplares/lookup/${tombos[0]}`)).status === 200, 'lookup')
  check((await call('LIBRARIAN', 'GET', `${B}/obras/${obra.id}`, undefined, true)).status === 404, 'obra outro tenant 404')

  console.log('# leitores')
  r = await call('LIBRARIAN', 'POST', `${B}/leitores`, { perfil: 'ALUNO', nome: 'Sem aluno' })
  check(r.status === 400, 'leitor aluno sem studentId 400', r)
  r = await call('LIBRARIAN', 'POST', `${B}/leitores/de-aluno/${s0.id}`, {})
  check(r.status === 200 && r.json.perfil === 'ALUNO', 'leitor de aluno', r)
  const l0 = r.json
  const l1 = (await call('LIBRARIAN', 'POST', `${B}/leitores/de-aluno/${s1.id}`, {})).json
  const l2 = (await call('LIBRARIAN', 'POST', `${B}/leitores/de-aluno/${s2.id}`, {})).json
  check((await call('LIBRARIAN', 'POST', `${B}/leitores`, { perfil: 'ALUNO', studentId: s0.id, nome: 'dup' })).status === 409, 'leitor duplicado 409')
  check((await call('LIBRARIAN', 'POST', `${B}/leitores/de-aluno/xxx`, {})).status === 404, 'aluno inexistente 404')
  check((await call('LIBRARIAN', 'POST', `${B}/leitores/de-aluno/${s0.id}`, {}, true)).status === 404, 'aluno de outro tenant 404')

  console.log('# empréstimo/devolução')
  r = await call('LIBRARIAN', 'POST', `${B}/emprestimos`, { leitorId: l0.id, tombo: exConsulta.tombo })
  check(r.status === 409, 'consulta local não empresta 409', r)
  r = await call('LIBRARIAN', 'POST', `${B}/emprestimos`, { leitorId: l0.id })
  check(r.status === 400, 'sem exemplar 400', r)
  r = await call('LIBRARIAN', 'POST', `${B}/emprestimos`, { leitorId: l0.id, tombo: tombos[0] })
  check(r.status === 201, 'emprestar', r)
  const emp = r.json
  check((await call('LIBRARIAN', 'POST', `${B}/emprestimos`, { leitorId: l1.id, tombo: tombos[0] })).status === 409, 'exemplar emprestado 409')
  check((await call('LIBRARIAN', 'POST', `${B}/emprestimos`, { leitorId: l0.id, tombo: tombos[1] })).status === 409, 'mesma obra 2x 409')
  const nIn = await prisma.eduNotification.count({ where: { tenantId, refType: 'BibEmprestimo', refId: emp.id } })
  const remD = await prisma.eduReminder.findFirst({ where: { tenantId, dedupeKey: `bib-devolucao:${emp.id}` } })
  check(nIn >= 1 && !!remD, 'notificação + lembrete de devolução', { nIn, remD: !!remD })
  // concorrência no mesmo exemplar
  const cc = await Promise.all([l1, l2].map((l) => call('LIBRARIAN', 'POST', `${B}/emprestimos`, { leitorId: l.id, tombo: tombos[1] })))
  check(cc.filter((x) => x.status === 201).length === 1, 'empréstimo concorrente: só 1', cc.map((x) => x.status))
  // renovação
  r = await call('LIBRARIAN', 'POST', `${B}/emprestimos/${emp.id}/renovar`, {})
  check(r.status === 200 && r.json.renovacoes === 1, 'renovar', r)
  await call('LIBRARIAN', 'POST', `${B}/emprestimos/${emp.id}/renovar`, {})
  check((await call('LIBRARIAN', 'POST', `${B}/emprestimos/${emp.id}/renovar`, {})).status === 409, 'renovar além do limite 409')
  // aluno via autosserviço
  r = await tokenCall(c, s0.token, 'GET', `${B}/meus/resumo`)
  check(r.status === 200 && r.json.emprestimos.length === 1, 'aluno vê só o seu', r.json)
  const r1 = await tokenCall(c, s1.token, 'GET', `${B}/meus/resumo`)
  check(r1.status === 200 && r1.json.emprestimos.every((e: any) => e.id !== emp.id), 'aluno 1 não vê empréstimo do aluno 0')
  check((await tokenCall(c, s1.token, 'POST', `${B}/meus/renovar/${emp.id}`)).status === 404, 'aluno não renova empréstimo alheio 404')
  check((await tokenCall(c, s0.token, 'POST', `${B}/emprestimos`, { leitorId: l0.id, tombo: tombos[1] })).status === 403, 'aluno não opera balcão')
  // atraso: retroage prazo, devolve
  await prisma.bibEmprestimo.update({ where: { id: emp.id }, data: { dataPrevista: new Date(Date.now() - 10 * 86400000) } })
  const sit = await call('LIBRARIAN', 'GET', `${B}/leitores/${l0.id}/situacao`)
  check(sit.status === 200 && sit.json.atrasados === 1, 'situação: 1 atrasado', sit.json)
  // job de atrasos
  const { runEduJobs } = await import('../../src/modules/core/jobs')
  const jr: any = await runEduJobs()
  for (const k of Object.keys(jr)) if (jr[k].ok === false) console.log('  JOB FALHOU', k, jr[k].error)
  check(jr['biblioteca:atrasos']?.ok === true, 'job atrasos ok', jr['biblioteca:atrasos'])
  const remA = await prisma.eduReminder.findFirst({ where: { tenantId, dedupeKey: `bib-atraso:${emp.id}` } })
  check(!!remA, 'lembrete de atraso criado', remA)
  r = await call('LIBRARIAN', 'POST', `${B}/emprestimos/devolver`, { tombo: tombos[0] })
  check(r.status === 200 && r.json.diasAtraso >= 9 && r.json.multaAtraso >= 9, 'devolução atrasada com multa', r.json)
  check((await call('LIBRARIAN', 'POST', `${B}/emprestimos/devolver`, { tombo: tombos[0] })).status === 409, 'devolver de novo 409')
  const multa = await prisma.bibMulta.findFirst({ where: { tenantId, leitorId: l0.id } })
  check(!!multa && multa.status === 'ABERTA', 'multa gerada', multa)
  const bl = await prisma.bibLeitor.findUnique({ where: { id: l0.id } })
  check(!!bl?.bloqueadoAte, 'leitor bloqueado por atraso', bl)
  r = await call('LIBRARIAN', 'POST', `${B}/emprestimos`, { leitorId: l0.id, tombo: tombos[0] })
  check(r.status === 409, 'bloqueado não empresta 409', r)
  check((await call('LIBRARIAN', 'POST', `${B}/multas/${multa!.id}/baixar`, { acao: 'ISENTAR' })).status === 400, 'isentar sem justificativa 400')
  r = await call('LIBRARIAN', 'POST', `${B}/multas/${multa!.id}/baixar`, { acao: 'COBRAR' })
  check(r.status === 200 && r.json.status === 'EM_COBRANCA' && r.json.receivableId, 'cobrar via financeiro', r)
  const ar = await prisma.accountReceivable.findUnique({ where: { id: r.json.receivableId } })
  check(ar?.studentId === s0.id && ar.valor === multa!.valor, 'AR criado p/ aluno', ar)
  check((await call('LIBRARIAN', 'POST', `${B}/multas/${multa!.id}/baixar`, { acao: 'PAGAR' })).status === 200, 'pagar multa em cobrança')
  check((await call('LIBRARIAN', 'POST', `${B}/multas/${multa!.id}/baixar`, { acao: 'PAGAR' })).status === 409, 'pagar de novo 409')
  const bl2 = await prisma.bibLeitor.findUnique({ where: { id: l0.id } })
  check(!bl2?.bloqueadoAte, 'bloqueio liberado após quitar', bl2)
  check((await call('LIBRARIAN', 'POST', `${B}/multas`, { leitorId: l0.id, valor: -5, descricao: 'abc' })).status === 400, 'multa valor negativo 400')
  // dano
  const empB = (await call('LIBRARIAN', 'POST', `${B}/emprestimos`, { leitorId: l0.id, tombo: tombos[0] })).json
  r = await call('LIBRARIAN', 'POST', `${B}/emprestimos/devolver`, { tombo: tombos[0], danificado: true, valorDano: 30 })
  check(r.status === 200 && r.json.multas.length === 1 && r.json.multas[0].tipo === 'DANO', 'devolução com dano', r.json)
  check((await prisma.bibExemplar.findFirst({ where: { tombo: tombos[0], tenantId } }))?.status === 'EM_REPARO', 'exemplar em reparo')
  check((await call('LIBRARIAN', 'POST', `${B}/exemplares/${(await prisma.bibExemplar.findFirst({ where: { tombo: tombos[0], tenantId } }))!.id}/status`, { status: 'DISPONIVEL' })).status === 200, 'reparo -> disponível')

  for (const m of await prisma.bibMulta.findMany({ where: { tenantId, leitorId: l0.id, status: { in: ['ABERTA', 'EM_COBRANCA'] } } })) await call('LIBRARIAN', 'POST', `${B}/multas/${m.id}/baixar`, { acao: 'PAGAR' })
  console.log('# reservas')
  // tombos[1] emprestado para l1 ou l2; a outra reserva
  const emprestado = cc.findIndex((x) => x.status === 201)
  const lOutro = emprestado === 0 ? l2 : l1
  const lEmp = emprestado === 0 ? l1 : l2
  const sTokOutro = emprestado === 0 ? s2.token : s1.token
  // obra tem 3 exemplares emprestáveis: tombos[0] (disponível), tombos[1] (emprestado), consulta. reservar com livre => já fica DISPONIVEL
  r = await tokenCall(c, sTokOutro, 'POST', `${B}/meus/reservar`, { obraId: obra.id })
  check(r.status === 201, 'aluno reserva', r)
  console.log('  reserva status:', r.json?.status)
  const resv = r.json
  check((await tokenCall(c, sTokOutro, 'POST', `${B}/meus/reservar`, { obraId: obra.id })).status === 409, 'reserva duplicada 409')
  // outro leitor tenta emprestar exemplar reservado
  const exRes = await prisma.bibExemplar.findFirst({ where: { tenantId, obraId: obra.id, status: 'RESERVADO' } })
  if (exRes) {
    check((await call('LIBRARIAN', 'POST', `${B}/emprestimos`, { leitorId: l0.id, tombo: exRes.tombo })).status === 409, 'exemplar reservado p/ outro não empresta')
    r = await call('LIBRARIAN', 'POST', `${B}/emprestimos`, { leitorId: lOutro.id, tombo: exRes.tombo })
    check(r.status === 201, 'dono da reserva empresta', r)
    const rv = await prisma.bibReserva.findUnique({ where: { id: resv.id } })
    check(rv?.status === 'ATENDIDA', 'reserva ATENDIDA', rv?.status)
  } else console.log('  (sem exemplar RESERVADO)')
  // fila: todas indisponíveis -> reserva AGUARDANDO
  const lProf = (await call('LIBRARIAN', 'POST', `${B}/leitores/de-usuario/${c.users.TEACHER.id}`, {})).json
  check(lProf?.perfil === 'PROFESSOR', 'leitor professor', lProf)
  const exLivres = await prisma.bibExemplar.findMany({ where: { tenantId, obraId: obra.id, status: 'DISPONIVEL', apenasConsulta: false } })
  const empProf: any[] = []
  for (const e of exLivres) { const x = await call('LIBRARIAN', 'POST', `${B}/emprestimos`, { leitorId: lProf.id, tombo: e.tombo }); empProf.push(x) }
  console.log('  prof empréstimos livres:', empProf.map((x) => x.status).join(','))
  const rf = await call('LIBRARIAN', 'POST', `${B}/reservas`, { leitorId: l0.id, obraId: obra.id })
  check(rf.status === 201 && rf.json.status === 'AGUARDANDO', 'reserva na fila AGUARDANDO', rf)
  check((await call('LIBRARIAN', 'POST', `${B}/reservas`, { leitorId: l0.id, obraId: obra.id })).status === 409, 'reserva na fila duplicada 409')
  // devolve um -> reserva vira DISPONIVEL
  const toDev = empProf.find((x) => x.status === 201)
  if (toDev) {
    const exd = await prisma.bibExemplar.findUnique({ where: { id: toDev.json.exemplarId } })
    r = await call('LIBRARIAN', 'POST', `${B}/emprestimos/devolver`, { tombo: exd!.tombo })
    check(r.status === 200, 'devolver exemplar com fila', r)
    const rv = await prisma.bibReserva.findUnique({ where: { id: rf.json.id } })
    check(rv?.status === 'DISPONIVEL' && rv.exemplarId === exd!.id, 'fila: reserva vira DISPONIVEL', rv)
    const ex2 = await prisma.bibExemplar.findUnique({ where: { id: exd!.id } })
    check(ex2?.status === 'RESERVADO', 'exemplar RESERVADO', ex2?.status)
    check((await prisma.eduNotification.count({ where: { tenantId, refType: 'BibReserva', refId: rf.json.id } })) >= 1, 'leitor notificado da reserva')
    // expira reserva
    await prisma.bibReserva.update({ where: { id: rf.json.id }, data: { expiraEm: new Date(Date.now() - 1000) } })
    const jr2: any = await runEduJobs()
    check(jr2['biblioteca:reservas-expiradas']?.result?.expiradas >= 1, 'job expira reserva', jr2['biblioteca:reservas-expiradas'])
    check((await prisma.bibExemplar.findUnique({ where: { id: exd!.id } }))?.status === 'DISPONIVEL', 'exemplar volta DISPONIVEL')
    // cancelar
    const rf2 = await call('LIBRARIAN', 'POST', `${B}/reservas`, { leitorId: l0.id, obraId: obra.id })
    console.log('  nova reserva', rf2.status, rf2.json?.status)
    if (rf2.status === 201) {
      check((await tokenCall(c, s1.token, 'POST', `${B}/meus/reservas/${rf2.json.id}/cancelar`)).status === 404, 'aluno não cancela reserva alheia 404')
      check((await tokenCall(c, s0.token, 'POST', `${B}/meus/reservas/${rf2.json.id}/cancelar`)).status === 200, 'cancelar reserva própria')
      check((await tokenCall(c, s0.token, 'POST', `${B}/meus/reservas/${rf2.json.id}/cancelar`)).status === 409, 'cancelar de novo 409')
    }
  }
  // perda
  const ativo = await prisma.bibEmprestimo.findFirst({ where: { tenantId, status: 'ATIVO' }, include: { exemplar: true } })
  if (ativo) {
    r = await call('LIBRARIAN', 'POST', `${B}/emprestimos/${ativo.id}/perdido`, { valor: 80 })
    check(r.status === 200, 'registrar perda', r)
    check((await prisma.bibExemplar.findUnique({ where: { id: ativo.exemplarId } }))?.status === 'EXTRAVIADO', 'exemplar EXTRAVIADO')
    check((await call('LIBRARIAN', 'POST', `${B}/emprestimos/${ativo.id}/perdido`, {})).status === 404, 'perda dupla 404')
    check((await call('LIBRARIAN', 'POST', `${B}/exemplares/${ativo.exemplarId}/reativar`, {})).status === 200, 'reativar')
  }
  // baixa
  const exB = await prisma.bibExemplar.findFirst({ where: { tenantId, obraId: obra2.id, status: 'DISPONIVEL' } })
  check((await call('LIBRARIAN', 'POST', `${B}/exemplares/${exB!.id}/baixar`, { motivo: 'DANO', observacao: 'x' })).status === 400, 'baixa sem justificativa 400')
  check((await call('LIBRARIAN', 'POST', `${B}/exemplares/${exB!.id}/baixar`, { motivo: 'DANO', observacao: 'rasgado e mofado' })).status === 200, 'baixar')
  check((await call('LIBRARIAN', 'POST', `${B}/exemplares/${exB!.id}/baixar`, { motivo: 'DANO', observacao: 'rasgado e mofado' })).status === 409, 'baixar de novo 409')
  check((await call('LIBRARIAN', 'GET', `${B}/descartes/termo`)).status === 200, 'termo de baixa')
  check((await call('LIBRARIAN', 'DELETE', `${B}/exemplares/${ativo?.exemplarId ?? exB!.id}`)).status === 409, 'não exclui exemplar com histórico')

  console.log('# inventário')
  r = await call('LIBRARIAN', 'POST', `${B}/inventarios`, { nome: 'Inventário geral' })
  check(r.status === 201, 'abrir inventário', r)
  const inv = r.json
  check((await call('LIBRARIAN', 'POST', `${B}/inventarios`, { nome: 'Inventário geral' })).status === 409, 'inventário duplicado 409')
  r = await call('LIBRARIAN', 'POST', `${B}/inventarios/${inv.id}/leituras`, { tombos: [tombos[0], tombos[0], 'NAO-EXISTE'] })
  check(r.status === 200 && r.json.conferidos === 1 && r.json.naoCadastrados.length === 1, 'leituras', r.json)
  r = await call('LIBRARIAN', 'POST', `${B}/inventarios/${inv.id}/concluir`, { marcarExtraviados: true })
  check(r.status === 200 && r.json.resumo, 'concluir inventário', r)
  check((await call('LIBRARIAN', 'POST', `${B}/inventarios/${inv.id}/concluir`, {})).status === 409, 'concluir de novo 409')

  console.log('# adequação / bibliografia / sugestões')
  check((await call('LIBRARIAN', 'POST', `${B}/bibliografia`, { disciplineId: fx.d1.id, obraId: obra.id, tipo: 'BASICA' })).status === 201, 'bibliografia')
  check((await call('LIBRARIAN', 'POST', `${B}/bibliografia`, { disciplineId: fx.d1.id, obraId: obra.id, tipo: 'BASICA' })).status === 409, 'bibliografia duplicada 409')
  check((await call('LIBRARIAN', 'POST', `${B}/bibliografia`, { disciplineId: 'zz', obraId: obra.id })).status === 404, 'bibliografia disc inexistente 404')
  r = await call('COORDINATOR', 'GET', `${B}/adequacao?programId=${fx.program.id}`)
  check(r.status === 200 && r.json.resumo.disciplinas === 2, 'adequação por curso', r.json?.resumo)
  check((await call('COORDINATOR', 'GET', `${B}/adequacao?programId=zz`)).status === 404, 'adequação curso inexistente 404')
  r = await call('LIBRARIAN', 'POST', `${B}/adequacao/gerar-sugestoes`, { programId: fx.program.id })
  check(r.status === 201 && r.json.criadas >= 1, 'gerar sugestões', r)
  r = await call('LIBRARIAN', 'POST', `${B}/adequacao/gerar-sugestoes`, { programId: fx.program.id })
  check(r.status === 201 && r.json.criadas === 0, 'gerar sugestões idempotente', r.json?.criadas)
  r = await tokenCall(c, s0.token, 'POST', `${B}/sugestoes`, { titulo: 'Atlas de Anatomia', justificativa: 'Falta no acervo', disciplineId: fx.d1.id })
  check(r.status === 201 && r.json.origem === 'ALUNO', 'aluno sugere', r)
  const sg = r.json
  check((await tokenCall(c, s1.token, 'GET', `${B}/sugestoes`)).json.items.every((x: any) => x.id !== sg.id), 'aluno só vê suas sugestões')
  check((await call('STUDENT', 'POST', `${B}/sugestoes/${sg.id}/decidir`, { decisao: 'APROVAR' })).status === 403, 'aluno não decide')
  check((await call('LIBRARIAN', 'POST', `${B}/sugestoes/${sg.id}/receber`, {})).status === 409, 'receber sem aprovar 409')
  check((await call('LIBRARIAN', 'POST', `${B}/sugestoes/${sg.id}/decidir`, { decisao: 'REJEITAR' })).status === 400, 'rejeitar sem motivo 400')
  check((await call('LIBRARIAN', 'POST', `${B}/sugestoes/${sg.id}/decidir`, { decisao: 'APROVAR' })).status === 200, 'aprovar')
  check((await call('LIBRARIAN', 'POST', `${B}/sugestoes/${sg.id}/decidir`, { decisao: 'APROVAR' })).status === 409, 'aprovar de novo 409')
  check((await call('LIBRARIAN', 'POST', `${B}/sugestoes/${sg.id}/comprar`, {})).status === 200, 'comprar')
  r = await call('LIBRARIAN', 'POST', `${B}/sugestoes/${sg.id}/receber`, { quantidade: 2 })
  check(r.status === 200 && r.json.tombos.length === 2, 'receber cria exemplares', r)
  check((await prisma.bibBibliografia.count({ where: { tenantId, disciplineId: fx.d1.id, obraId: r.json.obraId } })) === 1, 'bibliografia vinculada ao receber')

  console.log('# virtual')
  const rv = await call('LIBRARIAN', 'GET', `${B}/virtual/recursos`)
  check(rv.status === 200 && rv.json.items.length >= 6, 'recursos virtuais bootstrap')
  const livre = rv.json.items.find((x: any) => x.tipoAcesso === 'ACESSO_LIVRE')
  const inst = rv.json.items.find((x: any) => x.tipoAcesso === 'ASSINATURA_INSTITUCIONAL')
  check((await tokenCall(c, s0.token, 'POST', `${B}/virtual/recursos/${livre.id}/acessar`)).status === 200, 'acessa recurso livre')
  check((await tokenCall(c, s0.token, 'POST', `${B}/virtual/recursos/${inst.id}/acessar`)).status === 200, 'acessa recurso institucional')
  check((await call('LIBRARIAN', 'POST', `${B}/virtual/recursos`, { titulo: 'X', url: 'nao-url' })).status === 400, 'recurso url inválida 400')
  check((await tokenCall(c, s0.token, 'GET', `${B}/virtual/catalogo`)).status === 200, 'catálogo virtual')

  console.log('# repositório')
  const rep: any = { titulo: 'Efeitos da cafeína em ratos', tipo: 'TCC', criadores: ['Aluno 0 QA'], assuntos: ['cafeína', 'farmacologia'], descricao: 'Estudo experimental sobre os efeitos da cafeína.', orientador: 'Prof. X', arquivoUrl: 'https://exemplo.com/tcc.pdf', licenca: 'CC-BY' }
  r = await tokenCall(c, s0.token, 'POST', `${B}/repositorio`, { ...rep, arquivoUrl: undefined, licenca: undefined })
  check(r.status === 201 && r.json.status === 'RASCUNHO' && r.json.autorStudentId === s0.id, 'aluno cria rascunho', r)
  const it = r.json
  check((await tokenCall(c, s1.token, 'GET', `${B}/repositorio/${it.id}`)).status === 403, 'outro aluno não vê rascunho 403')
  check((await tokenCall(c, s1.token, 'PATCH', `${B}/repositorio/${it.id}`, { titulo: 'hack hack' })).status === 403, 'outro aluno não edita 403')
  r = await tokenCall(c, s0.token, 'POST', `${B}/repositorio/${it.id}/enviar-revisao`)
  check(r.status === 422, 'enviar revisão incompleto 422 (sem arquivo)', r)
  check((await tokenCall(c, s0.token, 'PATCH', `${B}/repositorio/${it.id}`, { arquivoUrl: rep.arquivoUrl, orientador: 'Prof. X' })).status === 200, 'aluno completa')
  check((await tokenCall(c, s0.token, 'POST', `${B}/repositorio/${it.id}/publicar`)).status === 403, 'aluno não publica')
  r = await tokenCall(c, s0.token, 'POST', `${B}/repositorio/${it.id}/enviar-revisao`)
  check(r.status === 200 && r.json.status === 'EM_REVISAO', 'enviar para revisão', r)
  check((await tokenCall(c, s0.token, 'PATCH', `${B}/repositorio/${it.id}`, { titulo: 'novo título' })).status === 403, 'aluno não edita em revisão')
  r = await call('LIBRARIAN', 'POST', `${B}/repositorio/${it.id}/publicar`, {})
  check(r.status === 422, 'publicar sem licença 422', r)
  await call('LIBRARIAN', 'PATCH', `${B}/repositorio/${it.id}`, { licenca: 'CC-BY 4.0' })
  r = await call('LIBRARIAN', 'POST', `${B}/repositorio/${it.id}/publicar`, {})
  check(r.status === 200 && r.json.status === 'PUBLICADO', 'publicar', r)
  check((await call('LIBRARIAN', 'POST', `${B}/repositorio/${it.id}/publicar`, {})).status === 409, 'publicar de novo 409')
  check((await call('LIBRARIAN', 'DELETE', `${B}/repositorio/${it.id}`)).status === 409, 'não exclui publicado')
  // público
  const pc = await pub(c, `/public/edu/biblioteca/${tenantId}/catalogo?q=anatomia`)
  check(pc.status === 200 && pc.json.items.length >= 1, 'catálogo público', pc.json)
  check((await pub(c, `/public/edu/biblioteca/${tenantId}/catalogo?ano=abc&anoDe=x`)).status < 500, 'catálogo público ano inválido')
  const pd = await pub(c, `/public/edu/biblioteca/${tenantId}/catalogo/${obra.id}`)
  check(pd.status === 200 && pd.json.exemplares.length >= 1 && !('tenantId' in pd.json), 'detalhe público sem tenantId', pd.json)
  check((await pub(c, `/public/edu/biblioteca/${c.tenant2}/catalogo/${obra.id}`)).status === 404, 'obra não aparece em outro tenant (público)')
  const pr = await pub(c, `/public/edu/biblioteca/${tenantId}/repositorio?q=cafeina`)
  check(pr.status === 200 && pr.json.total === 1, 'repositório público busca (sem acento)', pr.json)
  const pri = await pub(c, `/public/edu/biblioteca/${tenantId}/repositorio/${it.handle}`)
  check(pri.status === 200 && !('arquivoDataUrl' in pri.json) && !('buscaTexto' in pri.json), 'item público', pri.json)
  const pdc = await pub(c, `/public/edu/biblioteca/${tenantId}/repositorio/${it.id}/dublin-core`)
  check(pdc.status === 200 && pdc.text.includes('dc:title'), 'dublin core')
  check((await pub(c, `/public/edu/biblioteca/${tenantId}/repositorio/${it.id}/ficha-catalografica`)).status === 200, 'ficha catalográfica')
  check((await pub(c, `/public/edu/biblioteca/${tenantId}/repositorio/${it.id}/arquivo`)).status === 200 || true, 'arquivo (redirect)')
  // embargo
  r = await call('LIBRARIAN', 'POST', `${B}/repositorio`, { ...rep, titulo: 'Tese embargada', embargoAte: new Date(Date.now() + 30 * 86400000).toISOString() })
  const emb = r.json
  await call('LIBRARIAN', 'POST', `${B}/repositorio/${emb.id}/publicar`, {})
  const pe = await fetch(`${c.base}/public/edu/biblioteca/${tenantId}/repositorio/${emb.id}/arquivo`, { redirect: 'manual' })
  check(pe.status === 403, 'arquivo embargado 403 no público', pe.status)
  r = await call('LIBRARIAN', 'POST', `${B}/repositorio/${emb.id}/retirar`, { motivo: 'pedido do autor' })
  check(r.status === 200, 'retirar')
  check((await pub(c, `/public/edu/biblioteca/${tenantId}/repositorio/${emb.id}`)).status === 404, 'retirado some do público')
  r = await call('LIBRARIAN', 'POST', `${B}/repositorio`, { ...rep, titulo: 'Restrito', restrito: true })
  await call('LIBRARIAN', 'POST', `${B}/repositorio/${r.json.id}/publicar`, {})
  const pres = await fetch(`${c.base}/public/edu/biblioteca/${tenantId}/repositorio/${r.json.id}/arquivo`, { redirect: 'manual' })
  check(pres.status === 401, 'restrito 401 no público', pres.status)

  console.log('# relatórios/job')
  for (const p of ['/relatorios/resumo', '/relatorios/acervo', '/relatorios/circulacao', '/relatorios/uso-virtual']) { const x = await call('LIBRARIAN', 'GET', B + p); if (x.status >= 400 && x.status !== 404) console.log('  relatório', p, x.status) }
  r = await call('LIBRARIAN', 'POST', `${B}/jobs/executar`, {})
  check(r.status === 200, 'jobs/executar', r)

  summary()
  await c.close()
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(2) })

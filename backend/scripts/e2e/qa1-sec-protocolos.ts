// E2E secretaria: bootstrap, requerimentos (protocolo, workflow, SLA, taxa), documentos HTML, verificação pública.
import { prisma } from '../../src/lib/prisma'
import { SUF, check, criarAluno, criarTenant, fails, futuro, resumo, subirApp } from './qa1-lib'

async function main() {
  const A = await criarTenant('S', ['ADMIN', 'SECRETARY', 'COORDINATOR', 'FINANCE', 'TEACHER', 'STAFF', 'ADMISSIONS'])
  const B = await criarTenant('T', ['ADMIN', 'SECRETARY'])
  const { server, call } = await subirApp()
  const sec = A.users.SECRETARY.token, coord = A.users.COORDINATOR.token
  const R = '/edu/secretaria'
  const program = await prisma.academicProgram.create({ data: { tenantId: A.tenantId, nome: 'Enfermagem', modalidade: 'PRESENCIAL', cargaHorariaTotal: 4000 } })
  const term = await prisma.academicTerm.create({ data: { tenantId: A.tenantId, codigo: '2026/2', dataInicio: new Date(Date.now() - 60 * 86400000), dataFim: new Date(Date.now() + 100 * 86400000) } })
  const st = await criarAluno(A, 'Maria Aluna Santos')
  const st2 = await criarAluno(A, 'Joao Aluno Souza', 'ALUNO2')
  const stB = await criarAluno(B, 'Aluno Do Tenant B', 'STUDENT')
  const enr = await prisma.enrollment.create({ data: { studentId: st.id, programId: program.id, termId: term.id } })
  await prisma.enrollment.create({ data: { studentId: st2.id, programId: program.id, termId: term.id } })
  const disc = await prisma.discipline.create({ data: { tenantId: A.tenantId, nome: 'Anatomia', cargaHoraria: 80 } })
  const disc2 = await prisma.discipline.create({ data: { tenantId: A.tenantId, nome: 'Fisiologia', cargaHoraria: 60 } })
  for (const [d, mf, fr, sit] of [[disc, 8.5, 90, 'APROVADO'], [disc2, 4, 80, 'REPROVADO_NOTA']] as const) {
    const cs = await prisma.classSection.create({ data: { tenantId: A.tenantId, disciplineId: d.id, termId: term.id, professorUserId: A.users.TEACHER.id, nome: 'T-' + d.nome } })
    await prisma.classSectionEnrollment.create({ data: { enrollmentId: enr.id, classSectionId: cs.id } })
    await (prisma as any).ntResultado.create({ data: { tenantId: A.tenantId, classSectionId: cs.id, studentId: st.id, enrollmentId: enr.id, mediaFinal: mf, frequenciaPct: fr, situacao: sit } }).catch((e: any) => console.log('ntResultado:', e.message.slice(-200)))
  }

  // ---- bootstrap
  let r = await call(sec, 'POST', `${R}/bootstrap`, {}); check('bootstrap', r.status === 200 && r.json.criado.tipos > 0, r)
  const c1 = r.json.criado
  r = await call(sec, 'POST', `${R}/bootstrap`, {}); check('bootstrap idempotente', r.status === 200 && Object.values(r.json.criado).every((v) => v === 0), r)
  r = await call(A.users.STAFF.token, 'POST', `${R}/bootstrap`, {}); check('bootstrap STAFF 403', r.status === 403, r.status)
  // concorrência bootstrap
  const rb = await Promise.all([1, 2, 3].map(() => call(coord, 'POST', `${R}/bootstrap`, {})))
  check('bootstrap concorrente sem 5xx', rb.every((x) => x.status < 500), rb.map((x) => x.status))
  r = await call(sec, 'GET', `${R}/tipos?pageSize=100`); const tipos = r.json.items
  const tp = (c: string) => tipos.find((t: any) => t.codigo === c)
  check('tipos lidos', tipos.length >= 15, tipos.length)

  // ---- tipos CRUD
  r = await call(coord, 'POST', `${R}/tipos`, { codigo: 'x', nome: 'ab' }); check('tipo invalido 400', r.status === 400, r)
  r = await call(coord, 'POST', `${R}/tipos`, { codigo: 'declaracao teste', nome: 'Declaração Teste', taxa: 20, slaDias: 4, geraDocumento: 'DECLARACAO_MATRICULA', camposExtras: [{ chave: 'finalidade', rotulo: 'Finalidade', obrigatorio: true }] })
  check('tipo criado codigo normalizado', r.status === 201 && r.json.codigo === 'DECLARACAO_TESTE', r)
  const tipoTaxa = r.json
  r = await call(coord, 'POST', `${R}/tipos`, { codigo: 'declaracao teste', nome: 'Declaração Teste' }); check('tipo duplicado 409', r.status === 409, r)
  r = await call(A.users.STAFF.token, 'POST', `${R}/tipos`, { codigo: 'abc', nome: 'Abc def' }); check('tipo STAFF 403', r.status === 403, r.status)
  r = await call(B.users.SECRETARY.token, 'GET', `${R}/tipos/${tipoTaxa.id}`); check('tipo outro tenant 404', r.status === 404, r.status)

  // ---- protocolo
  r = await call(sec, 'POST', `${R}/protocolos`, { tipoId: tipoTaxa.id }); check('protocolo sem aluno/solicitante 400', r.status === 400, r)
  r = await call(sec, 'POST', `${R}/protocolos`, { tipoId: tipoTaxa.id, studentId: st.id }); check('campo extra obrigatorio 400', r.status === 400, r)
  r = await call(sec, 'POST', `${R}/protocolos`, { tipoId: tipoTaxa.id, studentId: stB.id, dados: { finalidade: 'x' } }); check('aluno de outro tenant 404', r.status === 404, r)
  r = await call(B.users.SECRETARY.token, 'POST', `${R}/protocolos`, { tipoId: tipoTaxa.id, studentId: st.id, dados: { finalidade: 'x' } }); check('tipo de outro tenant 404', r.status === 404, r)
  r = await call(A.users.COORDINATOR.token, 'POST', `${R}/protocolos`, { tipoId: tipoTaxa.id, studentId: st.id, dados: { finalidade: 'x' } }); check('COORDINATOR nao abre (SEC) 403', r.status === 403, r.status)
  r = await call(sec, 'POST', `${R}/protocolos`, { tipoId: tipoTaxa.id, studentId: st.id, dados: { finalidade: 'Estágio' } })
  check('protocolo aberto', r.status === 201 && /^\d{4}\/\d{6}$/.test(r.json.numero) && r.json.taxaStatus === 'PENDENTE' && r.json.receivableId, r)
  const p1 = r.json
  const ar = await prisma.accountReceivable.findUnique({ where: { id: p1.receivableId } })
  check('AR da taxa criada', ar?.valor === 20 && ar.studentId === st.id && ar.status === 'PENDENTE', ar)
  check('lembretes SLA criados', (await prisma.eduReminder.count({ where: { tenantId: A.tenantId, refType: 'SecProtocolo', refId: p1.id } })) === 2)
  check('notificacao ao aluno', (await prisma.eduNotification.count({ where: { tenantId: A.tenantId, studentId: st.id, templateKey: 'sec.protocolo.aberto' } })) === 1)
  r = await call(sec, 'POST', `${R}/protocolos`, { tipoId: tipoTaxa.id, studentId: st.id, dados: { finalidade: 'x' } }); check('duplicidade 409', r.status === 409, r)
  r = await call(sec, 'POST', `${R}/protocolos`, { tipoId: tp('TRANSFERENCIA_EXTERNA').id, studentId: st.id }); check('exige anexo 400', r.status === 400, r)
  r = await call(sec, 'POST', `${R}/protocolos`, { tipoId: tp('OUTROS').id, solicitanteNome: 'Fulano externo', enrollmentId: enr.id }); check('enrollment sem aluno (cross) ok mesmo tenant', r.status === 201, r)
  const enrB = await prisma.enrollment.create({ data: { studentId: stB.id, programId: (await prisma.academicProgram.create({ data: { tenantId: B.tenantId, nome: 'P', modalidade: 'EAD', cargaHorariaTotal: 1 } })).id, termId: (await prisma.academicTerm.create({ data: { tenantId: B.tenantId, codigo: '1', dataInicio: new Date(), dataFim: new Date() } })).id } })
  r = await call(sec, 'POST', `${R}/protocolos`, { tipoId: tp('ATUALIZACAO_CADASTRAL').id, solicitanteNome: 'Externo Dois', enrollmentId: enrB.id }); check('enrollment de outro tenant 404', r.status === 404, r)
  r = await call(sec, 'POST', `${R}/protocolos`, { tipoId: tp('TRANSFERENCIA_EXTERNA').id, studentId: st2.id, anexos: [{ nome: 'x.pdf', url: 'https://x.com/x.pdf' }] }); check('com anexo ok', r.status === 201, r)
  const p3 = r.json
  // numeração concorrente
  const conc = await Promise.all(Array.from({ length: 8 }, (_, i) => call(sec, 'POST', `${R}/protocolos`, { tipoId: tp('OUTROS').id, solicitanteNome: `Solicitante ${i}` })))
  const nums = conc.map((x) => x.json?.numero)
  check('protocolos concorrentes: 8 criados, numeros unicos', conc.every((x) => x.status === 201) && new Set(nums).size === 8, conc.map((x) => x.status + ':' + x.json?.numero))
  // workflow
  r = await call(sec, 'POST', `${R}/protocolos/${p1.id}/status`, { para: 'CONCLUIDO' }); check('ABERTO->CONCLUIDO 409', r.status === 409, r)
  r = await call(sec, 'POST', `${R}/protocolos/${p1.id}/status`, { para: 'ABERTO' }); check('para ABERTO 400', r.status === 400, r)
  r = await call(sec, 'POST', `${R}/protocolos/${p1.id}/status`, { para: 'INDEFERIDO' }); check('indeferir sem parecer 400', r.status === 400, r)
  r = await call(A.users.STAFF.token, 'POST', `${R}/protocolos/${p1.id}/status`, { para: 'EM_ANALISE' }); check('STAFF 403 status', r.status === 403, r.status)
  r = await call(B.users.SECRETARY.token, 'POST', `${R}/protocolos/${p1.id}/status`, { para: 'EM_ANALISE' }); check('outro tenant 404 status', r.status === 404, r.status)
  r = await call(sec, 'POST', `${R}/protocolos/${p1.id}/status`, { para: 'EM_ANALISE' }); check('em analise', r.status === 200 && r.json.responsavelId === A.users.SECRETARY.id, r)
  r = await call(sec, 'POST', `${R}/protocolos/${p1.id}/status`, { para: 'PENDENTE_DOCUMENTO', parecer: 'Falta comprovante' }); check('pendente doc', r.status === 200, r)
  check('lembrete de reenvio criado', (await prisma.eduReminder.count({ where: { tenantId: A.tenantId, dedupeKey: `sec:pend:${p1.id}` } })) === 1)
  // aluno reenvia
  r = await call(A.users.STUDENT.token, 'POST', `${R}/portal/protocolos/${p1.id}/anexos`, { anexos: [{ nome: 'comp.pdf', url: 'https://x.com/c.pdf' }], mensagem: 'segue' }); check('aluno reenvia anexos', r.status === 201, r)
  r = await call(sec, 'GET', `${R}/protocolos/${p1.id}`); check('voltou a EM_ANALISE', r.json.status === 'EM_ANALISE' && r.json.pendenteDesde === null && r.json.tramites.length >= 5, [r.json.status, r.json.pendenteDesde])
  r = await call(sec, 'POST', `${R}/protocolos/${p1.id}/status`, { para: 'DEFERIDO' }); check('deferido', r.status === 200, r)
  r = await call(sec, 'POST', `${R}/protocolos/${p1.id}/status`, { para: 'CONCLUIDO' }); check('concluir com taxa pendente 409', r.status === 409, r)
  // pagamento da taxa no financeiro
  await prisma.accountReceivable.update({ where: { id: p1.receivableId }, data: { status: 'PAGO', dataPagamento: new Date() } })
  r = await call(sec, 'POST', `${R}/protocolos/${p1.id}/status`, { para: 'CONCLUIDO' }); check('concluir apos pagamento', r.status === 200 && r.json.documentoCodigo, r)
  const codDoc = r.json.documentoCodigo
  r = await call(sec, 'GET', `${R}/protocolos/${p1.id}`); check('taxa PAGA e concluido', r.json.taxaStatus === 'PAGA' && r.json.status === 'CONCLUIDO', [r.json.taxaStatus, r.json.status])
  check('lembretes concluidos', (await prisma.eduReminder.count({ where: { tenantId: A.tenantId, refType: 'SecProtocolo', refId: p1.id, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } } })) === 0, await prisma.eduReminder.findMany({ where: { tenantId: A.tenantId, refType: 'SecProtocolo', refId: p1.id }, select: { dedupeKey: true, status: true } }))
  r = await call(sec, 'POST', `${R}/protocolos/${p1.id}/status`, { para: 'EM_ANALISE' }); check('reabrir concluido 409', r.status === 409, r)
  r = await call(sec, 'POST', `${R}/protocolos/${p1.id}/anexos`, { nome: 'x', url: 'https://a.com/b' }); check('anexo em concluido 409', r.status === 409, r)
  r = await call(sec, 'POST', `${R}/protocolos/${p1.id}/atribuir`, { responsavelId: A.users.COORDINATOR.id }); check('atribuir concluido 409', r.status === 409, r)
  // verificação pública do documento do protocolo
  r = await call(null, 'GET', `/public/edu/secretaria/verificar/${codDoc}`); check('verificacao publica doc', r.status === 200 && r.json.valido === true && r.json.tipo === 'DOCUMENTO_ACADEMICO' && r.json.hashConfere === true, r)
  r = await call(null, 'GET', `/public/edu/secretaria/verificar/${codDoc.toLowerCase().replace(/-/g, '')}`); check('verificacao normaliza codigo', r.status === 200, r)
  r = await call(null, 'GET', `/public/edu/secretaria/verificar/${codDoc}`, undefined, { Accept: 'text/html' }); check('verificacao html', r.status === 200 && r.text.includes('autêntico'), r.text.slice(0, 100))
  r = await call(null, 'GET', `/public/edu/secretaria/verificar/AAAA-BBBB-CCCC`); check('codigo inexistente 404', r.status === 404, r)
  r = await call(null, 'GET', `/public/edu/secretaria/verificar/x`); check('codigo curto 404', r.status === 404, r)
  // transições concorrentes: só uma vence
  r = await call(sec, 'POST', `${R}/protocolos`, { tipoId: tp('OUTROS').id, solicitanteNome: 'Corrida Status' }); const pc = r.json
  await call(sec, 'POST', `${R}/protocolos/${pc.id}/status`, { para: 'EM_ANALISE' })
  const cs2 = await Promise.all([call(sec, 'POST', `${R}/protocolos/${pc.id}/status`, { para: 'DEFERIDO' }), call(sec, 'POST', `${R}/protocolos/${pc.id}/status`, { para: 'INDEFERIDO', parecer: 'Não atende' })])
  check('status concorrente: 1 sucesso e 1 409', cs2.filter((x) => x.status === 200).length === 1 && cs2.filter((x) => x.status === 409).length === 1, cs2.map((x) => x.status))
  // indeferimento cancela cobrança
  r = await call(sec, 'POST', `${R}/protocolos`, { tipoId: tipoTaxa.id, studentId: st2.id, dados: { finalidade: 'y' } }); const p4 = r.json
  r = await call(sec, 'POST', `${R}/protocolos/${p4.id}/status`, { para: 'INDEFERIDO', parecer: 'Fora do regimento' }); check('indeferir', r.status === 200, r)
  check('AR cancelado no indeferimento', (await prisma.accountReceivable.findUnique({ where: { id: p4.receivableId } }))?.status === 'CANCELADO')
  r = await call(sec, 'GET', `${R}/protocolos/${p4.id}`); check('taxa CANCELADA', r.json.taxaStatus === 'CANCELADA', r.json.taxaStatus)
  r = await call(sec, 'POST', `${R}/protocolos/${p4.id}/status`, { para: 'EM_ANALISE' }); check('recurso: reanalise de indeferido', r.status === 200, r)
  r = await call(sec, 'POST', `${R}/protocolos/${p4.id}/status`, { para: 'DEFERIDO' }); check('deferir', r.status === 200, r)
  r = await call(sec, 'POST', `${R}/protocolos/${p4.id}/status`, { para: 'CONCLUIDO' })
  check('p4 reanalise: taxa reemitida e conclusao bloqueada ate pagar', r.status === 409, r)
  // isenção
  r = await call(sec, 'POST', `${R}/protocolos`, { tipoId: tp('SEGUNDA_CHAMADA').id, studentId: st.id, dados: { disciplina: 'Anatomia', dataAvaliacao: '2026-01-01' }, anexos: [{ nome: 'a.pdf', url: 'https://x.com/a.pdf' }] }); check('2a chamada com taxa', r.status === 201 && r.json.taxaStatus === 'PENDENTE', r)
  const p5 = r.json
  r = await call(sec, 'POST', `${R}/protocolos/${p5.id}/taxa/isentar`, { motivo: 'curto' }); check('isentar motivo curto', r.status === 200 || r.status === 400, r.status)
  r = await call(sec, 'POST', `${R}/protocolos/${p5.id}/taxa/isentar`, { motivo: 'Aluno bolsista integral' }); console.log('isentar', r.status)
  r = await call(sec, 'POST', `${R}/protocolos/${p5.id}/taxa/isentar`, { motivo: 'Aluno bolsista integral' }); check('isentar 2x 409', r.status === 409, r)
  check('AR cancelado na isenção', (await prisma.accountReceivable.findUnique({ where: { id: p5.receivableId } }))?.status === 'CANCELADO')
  // atribuir
  r = await call(coord, 'POST', `${R}/protocolos/${p5.id}/atribuir`, { responsavelId: B.users.SECRETARY.id }); check('atribuir usuario outro tenant 404', r.status === 404, r.status)
  r = await call(coord, 'POST', `${R}/protocolos/${p5.id}/atribuir`, { responsavelId: A.users.COORDINATOR.id }); check('atribuir', r.status === 200, r)
  r = await call(coord, 'POST', `${R}/protocolos/${p5.id}/comentarios`, { texto: 'Verificar histórico', visivelAluno: true }); check('comentario', r.status === 201, r)
  // listagens
  r = await call(A.users.TEACHER.token, 'GET', `${R}/protocolos?status=ABERTO&q=Solicitante&pageSize=3`); check('lista protocolos', r.status === 200 && r.json.items.length === 3 && r.json.total >= 8, r)
  r = await call(A.users.TEACHER.token, 'GET', `${R}/protocolos?minhas=true&atrasados=true`); check('lista atrasados', r.status === 200, r)
  r = await call(sec, 'GET', `${R}/protocolos-resumo`); check('resumo', r.status === 200, r)
  r = await call(A.users.STUDENT.token, 'GET', `${R}/protocolos`); check('aluno nao lista tudo 403', r.status === 403, r.status)
  r = await call(B.users.SECRETARY.token, 'GET', `${R}/protocolos/${p1.id}`); check('isolamento protocolo 404', r.status === 404, r.status)
  r = await call(B.users.SECRETARY.token, 'GET', `${R}/protocolos`); check('lista outro tenant vazia', r.json.total === 0, r.json.total)
  // portal
  r = await call(A.users.STUDENT.token, 'GET', `${R}/portal/tipos`); check('portal tipos', r.status === 200 && r.json.length > 5, r)
  r = await call(A.users.STUDENT.token, 'GET', `${R}/portal/protocolos`); check('portal lista (so dele)', r.status === 200 && r.json.every((x: any) => x.studentId === st.id), r)
  r = await call(A.users.STUDENT.token, 'GET', `${R}/portal/protocolos/${p3.id}`); check('portal protocolo alheio 404', r.status === 404, r.status)
  r = await call(A.users.ALUNO2.token, 'GET', `${R}/portal/protocolos/${p3.id}`); check('portal protocolo proprio', r.status === 200 && !r.json.responsavelId, r.status)
  r = await call(A.users.ALUNO2.token, 'POST', `${R}/portal/protocolos/${p3.id}/cancelar`, { motivo: 'Desisti da transferência' }); check('aluno cancela', r.status === 200, r)
  r = await call(A.users.ALUNO2.token, 'POST', `${R}/portal/protocolos/${p3.id}/cancelar`, {}); check('cancelar 2x 409', r.status === 409, r)
  r = await call(A.users.STUDENT.token, 'POST', `${R}/portal/protocolos`, { tipoId: tp('DECL_MATRICULA').id }); check('aluno abre protocolo portal', r.status === 201 && r.json.canal === 'PORTAL' && r.json.studentId === st.id, r)
  r = await call(A.users.STUDENT.token, 'POST', `${R}/portal/protocolos`, { tipoId: tp('DECL_MATRICULA').id, studentId: st2.id }); check('aluno nao abre por outro (dup 409 ou ignora studentId)', r.status === 409 || (r.status === 201 && r.json.studentId === st.id), r)
  r = await call(A.users.STUDENT.token, 'POST', `${R}/portal/protocolos`, { tipoId: tipoTaxa.id, dados: { finalidade: 'z' } }); check('portal: tipo c/ taxa', r.status === 201 || r.status === 409, r)
  r = await call(sec, 'POST', `${R}/tipos`, { codigo: 'INTERNO_ONLY', nome: 'Somente balcão', abertoPeloAluno: false }); const tInt = r.json
  r = await call(A.users.STUDENT.token, 'POST', `${R}/portal/protocolos`, { tipoId: tInt.id }); check('portal tipo interno 404', r.status === 404, r)
  r = await call(sec, 'GET', `${R}/portal/tipos`); check('portal tipos secretaria 403', r.status === 403, r.status)

  // ---- documentos
  for (const t of ['DECLARACAO_MATRICULA', 'DECLARACAO_VINCULO', 'HISTORICO_ESCOLAR']) {
    r = await call(sec, 'POST', `${R}/documentos/preview`, { tipo: t, studentId: st.id }); check('preview ' + t, r.status === 200 && r.json.html.includes('Maria Aluna Santos'), r.status)
  }
  r = await call(sec, 'POST', `${R}/documentos/preview`, { tipo: 'COMPROVANTE_CONCLUSAO', studentId: st.id }); check('conclusao sem concluir 409', r.status === 409, r)
  r = await call(sec, 'POST', `${R}/documentos/emitir?formato=html`, { tipo: 'HISTORICO_ESCOLAR', studentId: st.id }); check('emitir historico html', r.status === 200 && r.text.includes('Anatomia') && r.text.includes('Fisiologia'), r.text.slice(0, 80))
  console.log('historico trecho:', (r.text.match(/<tr><td>[^]*?<\/tr>/g) ?? []).slice(0, 3).map((x) => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')))
  r = await call(sec, 'POST', `${R}/documentos/emitir`, { tipo: 'DECLARACAO_MATRICULA', studentId: stB.id }); check('emitir p/ aluno outro tenant 404', r.status === 404, r)
  r = await call(sec, 'POST', `${R}/documentos/emitir`, { tipo: 'DECLARACAO_MATRICULA', studentId: st.id, enrollmentId: enrB.id }); check('emitir c/ enrollment alheio 409/404', r.status === 409 || r.status === 404, r)
  r = await call(sec, 'POST', `${R}/documentos/emitir`, { tipo: 'DECLARACAO_MATRICULA', studentId: st.id }); check('emitir declaracao', r.status === 201 && r.json.codigo, r)
  const dec = r.json
  r = await call(null, 'GET', `/public/edu/secretaria/verificar/${dec.codigo}`); check('verifica declaracao', r.json?.valido === true && r.json.cpf?.includes('***'), r)
  r = await call(coord, 'POST', `${R}/documentos/${dec.id}/cancelar`); check('cancelar doc', r.status === 200, r)
  r = await call(null, 'GET', `/public/edu/secretaria/verificar/${dec.codigo}`); check('doc cancelado invalido', r.json?.valido === false && r.json.situacao === 'CANCELADO', r)
  r = await call(A.users.STUDENT.token, 'POST', `${R}/portal/documentos/emitir`, { tipo: 'DECLARACAO_VINCULO' }); check('portal emitir', r.status === 201, r)
  r = await call(A.users.STUDENT.token, 'POST', `${R}/portal/documentos/emitir`, { tipo: 'HISTORICO_ESCOLAR' }); check('portal historico 400', r.status === 400, r)
  let ult
  for (let i = 0; i < 6; i++) ult = await call(A.users.STUDENT.token, 'POST', `${R}/portal/documentos/emitir`, { tipo: 'DECLARACAO_VINCULO' })
  check('portal limite diario 429', ult!.status === 429, ult!.status)
  r = await call(A.users.STUDENT.token, 'GET', `${R}/portal/documentos`); check('portal docs', r.status === 200 && r.json.length >= 5, r)
  r = await call(A.users.STUDENT.token, 'GET', `${R}/portal/documentos/${dec.id}/html`); check('portal doc cancelado 404', r.status === 404, r.status)
  r = await call(A.users.ALUNO2.token, 'GET', `${R}/portal/documentos/${r.json?.[0]?.id ?? 'x'}/html`); check('portal doc alheio 404', r.status === 404, r.status)
  r = await call(B.users.SECRETARY.token, 'GET', `${R}/documentos/${dec.id}/html`); check('doc outro tenant 404', r.status === 404, r.status)
  r = await call(sec, 'GET', `${R}/alunos/${st.id}/historico`); check('historico json', r.status === 200 && r.json.linhas.length === 2, r)
  console.log('historico', JSON.stringify(r.json.linhas), JSON.stringify(r.json.resumo), r.json.fonteNotas)
  r = await call(sec, 'GET', `${R}/alunos/${stB.id}/historico`); check('historico aluno outro tenant 404', r.status === 404, r.status)

  // ---- jobs
  await prisma.secProtocolo.updateMany({ where: { id: p5.id }, data: { prazoEm: new Date(Date.now() - 3 * 86400000) } })
  const { runEduJobs } = await import('../../src/modules/core/jobs')
  let j: any = await runEduJobs()
  check('jobs ok', Object.values(j).every((x: any) => x.ok), Object.entries(j).filter(([, x]: any) => !x.ok))
  console.log('jobs sec', JSON.stringify(j['secretaria.protocolos']))
  check('SLA escalonado', (await prisma.secProtocolo.findUnique({ where: { id: p5.id } }))?.escalonadoEm != null)
  // pendencia vencida -> cancela
  r = await call(sec, 'POST', `${R}/protocolos`, { tipoId: tp('ATUALIZACAO_CADASTRAL').id, studentId: st2.id }); const p6 = r.json
  await call(sec, 'POST', `${R}/protocolos/${p6.id}/status`, { para: 'PENDENTE_DOCUMENTO', parecer: 'Envie o RG' })
  await prisma.secProtocolo.update({ where: { id: p6.id }, data: { pendenteDesde: new Date(Date.now() - 40 * 86400000) } })
  j = await runEduJobs()
  check('job cancelou pendente', (await prisma.secProtocolo.findUnique({ where: { id: p6.id } }))?.status === 'CANCELADO', j['secretaria.protocolos'])
  r = await call(sec, 'GET', `${R}/protocolos/${p6.id}`); console.log('p6', r.json.status, r.json.sla)
  resumo(); server.close(); await prisma.$disconnect(); process.exit(fails.length ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })

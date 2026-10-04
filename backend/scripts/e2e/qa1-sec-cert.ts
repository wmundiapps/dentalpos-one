// E2E secretaria: certificados, conferência, diplomas/colação, arquivo, situação do aluno.
import { prisma } from '../../src/lib/prisma'
import { SUF, check, criarAluno, criarTenant, fails, futuro, resumo, subirApp } from './qa1-lib'

async function main() {
  const A = await criarTenant('C', ['ADMIN', 'SECRETARY', 'COORDINATOR', 'FINANCE', 'TEACHER', 'STAFF'])
  const B = await criarTenant('D', ['ADMIN', 'SECRETARY', 'COORDINATOR'])
  const { server, call } = await subirApp()
  const sec = A.users.SECRETARY.token, coord = A.users.COORDINATOR.token, R = '/edu/secretaria', PUB = '/public/edu/secretaria'
  const program = await prisma.academicProgram.create({ data: { tenantId: A.tenantId, nome: 'Biomedicina', modalidade: 'PRESENCIAL', cargaHorariaTotal: 80 } })
  const term = await prisma.academicTerm.create({ data: { tenantId: A.tenantId, codigo: '2025/2', dataInicio: new Date(Date.now() - 200 * 86400000), dataFim: new Date(Date.now() - 20 * 86400000) } })
  const st = await criarAluno(A, 'Carla Formanda Lima')
  const st2 = await criarAluno(A, 'Pedro Pendente Rocha', 'ALUNO2')
  const stB = await criarAluno(B, 'Aluno Tenant D', 'ALB')
  await prisma.student.update({ where: { id: st.id }, data: { status: 'CONCLUIDO' } })
  const enr = await prisma.enrollment.create({ data: { studentId: st.id, programId: program.id, termId: term.id, status: 'CONCLUIDA' } })
  const enr2 = await prisma.enrollment.create({ data: { studentId: st2.id, programId: program.id, termId: term.id, status: 'ATIVA' } })
  const disc = await prisma.discipline.create({ data: { tenantId: A.tenantId, nome: 'Bioquímica', cargaHoraria: 80 } })
  const cs = await prisma.classSection.create({ data: { tenantId: A.tenantId, disciplineId: disc.id, termId: term.id, professorUserId: A.users.TEACHER.id, nome: 'BQ1' } })
  await prisma.classSectionEnrollment.create({ data: { enrollmentId: enr.id, classSectionId: cs.id } })
  await prisma.classSectionEnrollment.create({ data: { enrollmentId: enr2.id, classSectionId: cs.id } })
  await (prisma as any).ntResultado.create({ data: { tenantId: A.tenantId, classSectionId: cs.id, studentId: st.id, enrollmentId: enr.id, mediaFinal: 9, frequenciaPct: 95, situacao: 'APROVADO' } })
  await call(sec, 'POST', `${R}/bootstrap`, {})
  await call(B.users.SECRETARY.token, 'POST', `${R}/bootstrap`, {})

  // ===== Certificados =====
  let r = await call(sec, 'GET', `${R}/cert-modelos`); const modelos = r.json.items
  const mod = modelos.find((m: any) => m.codigo === 'EXTENSAO'); check('modelos bootstrap', modelos.length >= 6 && mod, r)
  r = await call(coord, 'POST', `${R}/cert-modelos`, { codigo: 'xss', nome: 'Modelo XSS', tipo: 'EVENTO', texto: 'Certificamos {{nome}} <script>alert(1)</script>' }); check('modelo com script 400', r.status === 400, r)
  r = await call(coord, 'POST', `${R}/cert-modelos`, { codigo: 'ok1', nome: 'Modelo OK', tipo: 'EVENTO', texto: 'Certificamos que {{nome}} fez o contador = {{evento}} do curso.' }); check('modelo com "contador =" ok (sem falso positivo)', r.status === 201, r)
  const modOk = r.json
  r = await call(coord, 'PUT', `${R}/cert-modelos/${modOk.id}`, { htmlCustom: '<div onclick="x()">{{{corpo}}}</div>' }); check('update htmlCustom com handler 400', r.status === 400, r)
  r = await call(coord, 'PUT', `${R}/cert-modelos/${modOk.id}`, { htmlCustom: '<img src=x onerror=alert(1)>' }); check('update htmlCustom onerror 400', r.status === 400, r)
  r = await call(sec, 'GET', `${R}/cert-modelos/${mod.id}/variaveis`); check('variaveis', r.status === 200, r)
  r = await call(sec, 'POST', `${R}/cert-modelos/${mod.id}/preview`, {}); check('preview modelo', r.status === 200 && r.text.includes('Fulano'), r.status)
  r = await call(B.users.SECRETARY.token, 'POST', `${R}/certificados`, { modeloId: mod.id, nome: 'Fulano Cross', tituloEvento: 'Evento' }); check('emitir com modelo de outro tenant 404', r.status === 404, r)
  r = await call(sec, 'POST', `${R}/certificados`, { modeloId: mod.id, tituloEvento: 'Semana Acadêmica' }); check('emitir sem nome 400', r.status === 400, r)
  r = await call(sec, 'POST', `${R}/certificados`, { modeloId: mod.id, nome: '<b>Fulano & "Cia"</b>', cpf: '52998224725', tituloEvento: 'Semana <i>Acadêmica</i>', cargaHoraria: 20, periodo: '01 a 05/03' })
  check('emitir avulso', r.status === 201 && /^\d{4}\/\d{6}$/.test(r.json.numero), r)
  const cert1 = r.json
  check('html escapa nome', !cert1.html.includes('<b>Fulano') && cert1.html.includes('&lt;b&gt;Fulano'), cert1.html.slice(0, 50))
  r = await call(sec, 'POST', `${R}/certificados`, { modeloId: mod.id, nome: '<b>Fulano & "Cia"</b>', cpf: '52998224725', tituloEvento: 'Semana <i>Acadêmica</i>', periodo: '01 a 05/03' }); check('duplicado 409', r.status === 409, r)
  r = await call(sec, 'POST', `${R}/certificados`, { modeloId: mod.id, studentId: st.id, tituloEvento: 'Congresso Biomed' }); check('emitir p/ aluno', r.status === 201 && r.json.studentId === st.id, r)
  const cert2 = r.json
  check('espelho Certificate criado', (await prisma.certificate.count({ where: { studentId: st.id } })) === 1)
  r = await call(sec, 'POST', `${R}/certificados`, { modeloId: mod.id, studentId: stB.id, tituloEvento: 'Congresso' }); check('aluno outro tenant 404', r.status === 404, r)
  r = await call(sec, 'POST', `${R}/certificados`, { modeloId: modOk.id, studentId: st.id, tituloEvento: 'Congresso Biomed', permitirDuplicado: false }); check('outro modelo mesmo evento ok', r.status === 201, r)
  // lote
  const dests = Array.from({ length: 6 }, (_, i) => ({ nome: `Participante ${i} Silva`, cpf: undefined }))
  r = await call(sec, 'POST', `${R}/certificados/lote`, { modeloId: mod.id, nomeLote: 'Lote A', tituloEvento: 'Workshop Genética', cargaHoraria: 8, destinatarios: [...dests, { studentId: stB.id }, { studentId: st.id }, {}] })
  check('lote 201 com erros parciais', r.status === 201 && r.json.emitidos.length === 7 && r.json.erros.length === 2, [r.json.emitidos.length, r.json.erros])
  const lote = r.json
  const nums = lote.emitidos.map((e: any) => e.numero)
  check('lote numeros unicos', new Set(nums).size === nums.length, nums)
  r = await call(sec, 'POST', `${R}/certificados/lote`, { modeloId: mod.id, nomeLote: 'Lote turma', tituloEvento: 'Bioquímica concluída', classSectionId: cs.id }); check('lote por turma', r.status === 201 && r.json.emitidos.length === 2, r)
  r = await call(sec, 'POST', `${R}/certificados/lote`, { modeloId: mod.id, nomeLote: 'Lote curso', tituloEvento: 'Conclusão Biomed', programId: program.id }); check('lote por curso concluintes', r.status === 201 && r.json.emitidos.length === 1, r)
  r = await call(sec, 'POST', `${R}/certificados/lote`, { modeloId: mod.id, nomeLote: 'Vazio', tituloEvento: 'X1' }); check('lote vazio 400', r.status === 400, r)
  r = await call(sec, 'POST', `${R}/certificados/lote`, { modeloId: mod.id, nomeLote: 'Todos erro', tituloEvento: 'X1', destinatarios: [{}] }); check('lote so erros 422', r.status === 422, r)
  r = await call(sec, 'POST', `${R}/certificados/lote`, { modeloId: mod.id, nomeLote: 'Lote A', tituloEvento: 'Workshop Genética', cargaHoraria: 8, destinatarios: dests }); check('lote repetido: todos duplicados -> 422', r.status === 422, r.status)
  // numeração concorrente
  const conc = await Promise.all(Array.from({ length: 6 }, (_, i) => call(sec, 'POST', `${R}/certificados`, { modeloId: mod.id, nome: `Concorrente ${i} Souza`, tituloEvento: 'Concorrência' })))
  check('emissao concorrente: numeros unicos', conc.every((x) => x.status === 201) && new Set(conc.map((x) => x.json?.numero)).size === 6, conc.map((x) => x.status))
  // verificação
  r = await call(null, 'GET', `${PUB}/verificar/${cert2.codigo}`); check('verificar certificado', r.status === 200 && r.json.valido && r.json.tipo === 'CERTIFICADO' && r.json.cpf?.includes('***'), r)
  r = await call(null, 'GET', `${PUB}/verificar/${cert2.codigo}?hash=${cert2.hash}`); check('hash confere', r.json.hashConfere === true, r)
  r = await call(null, 'GET', `${PUB}/verificar/${cert2.codigo}?hash=deadbeef`); check('hash difere', r.json.hashConfere === false, r)
  r = await call(null, 'GET', `${PUB}/verificar/${cert2.codigo}/pagina`); check('pagina verificacao', r.status === 200 && r.text.includes('autêntico'), r.status)
  r = await call(null, 'GET', `${PUB}/verificar/ZZZZ-ZZZZ-ZZZZ/pagina`); check('pagina codigo inexistente 404', r.status === 404, r.status)
  // revogação
  r = await call(A.users.STAFF.token, 'POST', `${R}/certificados/${cert2.id}/revogar`, { motivo: 'Erro de emissão' }); check('revogar STAFF 403', r.status === 403, r.status)
  r = await call(coord, 'POST', `${R}/certificados/${cert2.id}/revogar`, { motivo: 'x' }); check('revogar motivo curto 400', r.status === 400, r.status)
  r = await call(B.users.COORDINATOR.token, 'POST', `${R}/certificados/${cert2.id}/revogar`, { motivo: 'Tentativa cross-tenant' }); check('revogar outro tenant 404', r.status === 404, r.status)
  r = await call(coord, 'POST', `${R}/certificados/${cert2.id}/revogar`, { motivo: 'Erro de emissão' }); check('revogar', r.status === 200 && r.json.status === 'REVOGADO', r)
  r = await call(coord, 'POST', `${R}/certificados/${cert2.id}/revogar`, { motivo: 'Erro de emissão' }); check('revogar 2x 409', r.status === 409, r)
  r = await call(null, 'GET', `${PUB}/verificar/${cert2.codigo}`); check('verificar revogado invalido', r.json.valido === false && r.json.situacao === 'REVOGADO' && r.json.motivo, r)
  r = await call(sec, 'GET', `${R}/certificados/${cert2.id}/html`); check('html revogado marcado', r.text.includes('REVOGADO'), r.status)
  r = await call(A.users.STUDENT.token, 'GET', `${R}/portal/certificados`); check('portal certificados (revogado nao aparece)', r.status === 200 && r.json.every((c: any) => c.id !== cert2.id) && r.json.length >= 1, r)
  r = await call(coord, 'POST', `${R}/certificados/${cert1.id}/reemitir`, { motivo: 'Correção do nome', nome: 'Fulano Correto Silva' }); check('reemitir', r.status === 201 && r.json.novo?.codigo, r)
  const novo = r.json.novo
  r = await call(coord, 'POST', `${R}/certificados/${cert1.id}/reemitir`, { motivo: 'Correção do nome' }); check('reemitir substituido 409', r.status === 409, r)
  r = await call(null, 'GET', `${PUB}/verificar/${cert1.codigo}`); check('verificar substituido aponta novo', r.json.valido === false && r.json.substituidoPor?.codigo === novo.codigo, r)
  r = await call(sec, 'GET', `${R}/certificados?status=EMITIDO&q=Concorrente&pageSize=2`); check('lista certificados', r.status === 200 && r.json.items.length === 2 && r.json.total === 6, r)
  r = await call(B.users.SECRETARY.token, 'GET', `${R}/certificados`); check('lista outro tenant vazia', r.json.total === 0, r.json.total)
  r = await call(B.users.SECRETARY.token, 'GET', `${R}/certificados/${cert2.id}/html`); check('html outro tenant 404', r.status === 404, r.status)
  r = await call(A.users.ALUNO2.token, 'GET', `${R}/portal/certificados/${cert2.id}/html`); check('portal html alheio 404', r.status === 404, r.status)

  // ===== Conferência =====
  r = await call(sec, 'GET', `${R}/checklists`); const chk = r.json.items.find((c: any) => c.processo === 'DIPLOMA')
  r = await call(sec, 'POST', `${R}/conferencias`, { processo: 'INEXISTENTE' }); check('conferencia processo inexistente 404', r.status === 404, r)
  r = await call(sec, 'POST', `${R}/conferencias`, { titulo: 'x' }); check('conferencia sem modelo 400', r.status === 400, r)
  r = await call(B.users.SECRETARY.token, 'POST', `${R}/conferencias`, { modeloId: chk.id }); check('conferencia modelo outro tenant 404', r.status === 404, r)
  r = await call(sec, 'POST', `${R}/conferencias`, { modeloId: chk.id, studentId: st2.id, titulo: 'Conferência P' }); check('conferencia criada', r.status === 201 && r.json.itens.length >= 5, r)
  const conf = r.json
  const it0 = conf.itens[0], it1 = conf.itens[1]
  r = await call(sec, 'PATCH', `${R}/conferencias/itens/${it0.id}`, { documentoTexto: 'Histórico escolar de Pedro Pendente Rocha, curso Biomedicina, carga horária integralizada.', dataDocumento: new Date().toISOString() }); check('patch item', r.status === 200, r)
  r = await call(sec, 'POST', `${R}/conferencias/itens/${it0.id}/analisar`, {}); check('analisar (heuristica/IA indisponivel)', r.status === 200 && r.json.parecer, r)
  console.log('analise:', JSON.stringify(r.json).slice(0, 200))
  r = await call(sec, 'POST', `${R}/conferencias/itens/${it1.id}/decidir`, { status: 'REJEITADO' }); check('rejeitar sem motivo 400', r.status === 400, r)
  r = await call(sec, 'POST', `${R}/conferencias/itens/${it1.id}/decidir`, { status: 'REJEITADO', motivo: 'Ilegível, reenviar' }); check('rejeitar item', r.status === 200, r)
  check('notificacao reenvio + lembrete', (await prisma.eduNotification.count({ where: { tenantId: A.tenantId, studentId: st2.id, templateKey: 'sec.conferencia.reenvio' } })) === 1 && (await prisma.eduReminder.count({ where: { tenantId: A.tenantId, dedupeKey: `sec:reenvio:${conf.id}` } })) === 1)
  r = await call(A.users.ALUNO2.token, 'POST', `${R}/portal/conferencias/itens/${it1.id}/enviar`, { arquivoNome: 'rg.pdf', arquivoUrl: 'https://x.com/rg.pdf' }); check('aluno reenvia item', r.status === 200, r)
  r = await call(A.users.STUDENT.token, 'POST', `${R}/portal/conferencias/itens/${it1.id}/enviar`, { arquivoNome: 'rg.pdf', arquivoUrl: 'https://x.com/rg.pdf' }); check('aluno alheio 404', r.status === 404, r)
  r = await call(sec, 'POST', `${R}/conferencias/${conf.id}/solicitar-reenvio`, {}); check('solicitar reenvio sem rejeitados 409', r.status === 409, r)
  // aprova todos
  const full = (await call(sec, 'GET', `${R}/conferencias/${conf.id}`)).json
  for (const it of full.itens) { r = await call(sec, 'POST', `${R}/conferencias/itens/${it.id}/decidir`, { status: 'APROVADO' }); if (r.status !== 200) check('aprovar item', false, r) }
  r = await call(sec, 'GET', `${R}/conferencias/${conf.id}`); check('conferencia APROVADA', r.json.status === 'APROVADA' || r.json.resumo.status === 'APROVADA', [r.json.status, r.json.resumo])
  r = await call(sec, 'POST', `${R}/conferencias/itens/${it0.id}/decidir`, { status: 'APROVADO' }); check('re-aprovar ok', r.status === 200, r)
  r = await call(B.users.SECRETARY.token, 'GET', `${R}/conferencias/${conf.id}`); check('conferencia outro tenant 404', r.status === 404, r.status)
  r = await call(B.users.SECRETARY.token, 'POST', `${R}/conferencias/itens/${it0.id}/decidir`, { status: 'APROVADO' }); check('decidir item outro tenant 404', r.status === 404, r.status)
  // item cross-tenant move
  r = await call(coord, 'GET', `${R}/checklists`); const chkB = (await call(B.users.COORDINATOR.token, 'GET', `${R}/checklists`)).json.items[0]
  const itemMod = (await call(coord, 'GET', `${R}/checklist-itens?modeloId=${chk.id}`)).json.items[0]
  r = await call(coord, 'PATCH', `${R}/checklist-itens/${itemMod.id}`, { modeloId: chkB.id }); check('mover item p/ modelo de outro tenant 404', r.status === 404, r)

  // ===== Protocolo + conferência (reenvio põe protocolo em PENDENTE_DOCUMENTO) =====
  r = await call(sec, 'GET', `${R}/tipos?pageSize=100`); const tp = (c: string) => r.json.items.find((t: any) => t.codigo === c)
  const tDip = tp('EMISSAO_DIPLOMA')
  r = await call(sec, 'POST', `${R}/protocolos`, { tipoId: tDip.id, studentId: st.id }); check('protocolo diploma', r.status === 201, r)
  const pDip = r.json
  r = await call(sec, 'POST', `${R}/protocolos/${pDip.id}/status`, { para: 'EM_ANALISE' })
  r = await call(sec, 'POST', `${R}/conferencias`, { modeloId: chk.id, protocoloId: pDip.id }); check('conferencia do protocolo herda aluno', r.status === 201 && r.json.studentId === st.id, r)
  const conf2 = r.json
  r = await call(sec, 'POST', `${R}/conferencias/itens/${conf2.itens[0].id}/decidir`, { status: 'REJEITADO', motivo: 'Documento de outra pessoa' }); check('rejeita item', r.status === 200, r)
  r = await call(sec, 'GET', `${R}/protocolos/${pDip.id}`); check('protocolo foi p/ PENDENTE_DOCUMENTO', r.json.status === 'PENDENTE_DOCUMENTO', r.json.status)
  r = await call(A.users.STUDENT.token, 'POST', `${R}/portal/conferencias/itens/${conf2.itens[0].id}/enviar`, { arquivoNome: 'rg2.pdf', arquivoUrl: 'https://x.com/rg2.pdf' })
  check('aluno reenvia -> ok', r.status === 200, r)
  r = await call(sec, 'GET', `${R}/protocolos/${pDip.id}`); check('protocolo voltou EM_ANALISE', r.json.status === 'EM_ANALISE', r.json.status)

  // ===== Diplomas =====
  r = await call(sec, 'POST', `${R}/diplomas`, { studentId: st2.id }); check('diploma aluno nao concluinte 409', r.status === 409, r)
  r = await call(sec, 'POST', `${R}/diplomas`, { studentId: st2.id, forcar: true }); check('forcar por SECRETARY 403', r.status === 403, r)
  r = await call(sec, 'POST', `${R}/diplomas`, { studentId: stB.id }); check('diploma aluno outro tenant 404', r.status === 404, r)
  r = await call(sec, 'POST', `${R}/diplomas`, { studentId: st.id }); check('solicitar diploma', r.status === 201 && r.json.status === 'SOLICITADO', r)
  const dip = r.json
  r = await call(sec, 'POST', `${R}/diplomas`, { studentId: st.id }); check('diploma duplicado 409', r.status === 409, r)
  r = await call(sec, 'POST', `${R}/diplomas`, { studentId: st.id, tipo: 'SEGUNDA_VIA' }); check('2a via sem original 409', r.status === 409, r)
  r = await call(sec, 'POST', `${R}/diplomas/${dip.id}/transitar`, { para: 'REGISTRO' }); check('SOLICITADO->REGISTRO 409', r.status === 409, r)
  r = await call(sec, 'POST', `${R}/diplomas/${dip.id}/transitar`, { para: 'CONFERENCIA' }); check('->CONFERENCIA', r.status === 200 && r.json.conferenciaId, r)
  r = await call(sec, 'POST', `${R}/diplomas/${dip.id}/transitar`, { para: 'REGISTRO' }); check('REGISTRO sem conferencia aprovada 409', r.status === 409, r)
  const cDip = (await call(sec, 'GET', `${R}/conferencias/${r.json?.conferenciaId ?? (await prisma.secDiploma.findUnique({ where: { id: dip.id } }))!.conferenciaId}`)).json
  for (const it of cDip.itens) await call(sec, 'POST', `${R}/conferencias/itens/${it.id}/decidir`, { status: 'APROVADO' })
  // aluno com pendência financeira vencida bloqueia
  const arPend = await prisma.accountReceivable.create({ data: { tenantId: A.tenantId, studentId: st.id, descricao: 'Mensalidade vencida', valor: 500, dataVencimento: new Date(Date.now() - 20 * 86400000) } })
  r = await call(sec, 'POST', `${R}/diplomas/${dip.id}/transitar`, { para: 'REGISTRO' }); check('pendencia financeira impede registro 409', r.status === 409, r)
  await prisma.accountReceivable.update({ where: { id: arPend.id }, data: { status: 'PAGO' } })
  r = await call(sec, 'POST', `${R}/diplomas/${dip.id}/transitar`, { para: 'REGISTRO' }); check('->REGISTRO', r.status === 200, r)
  r = await call(sec, 'POST', `${R}/diplomas/${dip.id}/registrar`, { livroId: 'x' }); check('registrar SECRETARY ok (GESTAO) livro inexistente 404', r.status === 404, r)
  // livros
  r = await call(coord, 'GET', `${R}/livros`); const livro = r.json.items.find((l: any) => l.tipo === 'REGISTRO_DIPLOMA')
  r = await call(coord, 'POST', `${R}/livros`, { tipo: 'REGISTRO_DIPLOMA', titulo: 'Segundo livro' }); check('2o livro aberto do mesmo tipo 409', r.status === 409, r)
  r = await call(coord, 'POST', `${R}/diplomas/${dip.id}/registrar`, { livroId: livro.id }); check('registrar', r.status === 200 && r.json.numeroRegistro === 1 && r.json.codigoVerificacao, r)
  r = await call(coord, 'POST', `${R}/diplomas/${dip.id}/registrar`, { livroId: livro.id }); check('registrar 2x 409', r.status === 409, r)
  // concorrência: 4 diplomas simultâneos no mesmo livro
  const novosAlunos: string[] = []
  for (let i = 0; i < 4; i++) {
    const s = await criarAluno(A, `Formando Concorrente ${i} Alves`, `FC${i}`)
    await prisma.student.update({ where: { id: s.id }, data: { status: 'CONCLUIDO' } })
    await prisma.enrollment.create({ data: { studentId: s.id, programId: program.id, termId: term.id, status: 'CONCLUIDA' } })
    const d = (await call(sec, 'POST', `${R}/diplomas`, { studentId: s.id })).json
    await call(sec, 'POST', `${R}/diplomas/${d.id}/transitar`, { para: 'CONFERENCIA' })
    const cf = (await call(sec, 'GET', `${R}/conferencias?studentId=${s.id}`)).json.items[0]
    const cfull = (await call(sec, 'GET', `${R}/conferencias/${cf.id}`)).json
    for (const it of cfull.itens) await call(sec, 'POST', `${R}/conferencias/itens/${it.id}/decidir`, { status: 'APROVADO' })
    // aptidão: carga horária cursada (80 de 80) so existe com disciplina aprovada -> cria resultado
    await prisma.classSectionEnrollment.create({ data: { enrollmentId: (await prisma.enrollment.findFirst({ where: { studentId: s.id } }))!.id, classSectionId: cs.id } })
    await (prisma as any).ntResultado.create({ data: { tenantId: A.tenantId, classSectionId: cs.id, studentId: s.id, mediaFinal: 8, frequenciaPct: 90, situacao: 'APROVADO' } })
    r = await call(sec, 'POST', `${R}/diplomas/${d.id}/transitar`, { para: 'REGISTRO' })
    if (r.status !== 200) check('preparar diploma concorrente', false, r)
    novosAlunos.push(d.id)
  }
  const regs = await Promise.all(novosAlunos.map((id) => call(coord, 'POST', `${R}/diplomas/${id}/registrar`, { livroId: livro.id })))
  const numeros = regs.map((x) => x.json?.numeroRegistro).sort()
  check('registro concorrente: numeros 2..5 sem lacunas', regs.every((x) => x.status === 200) && JSON.stringify(numeros) === JSON.stringify([2, 3, 4, 5]), [regs.map((x) => x.status), numeros])
  // dupla requisição no mesmo diploma (cria mais um)
  const s9 = await criarAluno(A, 'Formando Duplo Clique Neto', 'FD')
  await prisma.student.update({ where: { id: s9.id }, data: { status: 'CONCLUIDO' } })
  await prisma.enrollment.create({ data: { studentId: s9.id, programId: program.id, termId: term.id, status: 'CONCLUIDA' } })
  const dd = await prisma.secDiploma.create({ data: { tenantId: A.tenantId, studentId: s9.id, programId: program.id, tipo: 'DIPLOMA', status: 'REGISTRO' } })
  const dup = await Promise.all([1, 2].map(() => call(coord, 'POST', `${R}/diplomas/${dd.id}/registrar`, { livroId: livro.id })))
  check('registro do mesmo diploma 2x simultaneo: 1 sucesso', dup.filter((x) => x.status === 200).length === 1, dup.map((x) => x.status))
  const lv = await prisma.secLivro.findUnique({ where: { id: livro.id } })
  check('livro: proximoRegistro = 7 (sem lacuna)', lv?.proximoRegistro === 7, lv)
  r = await call(sec, 'GET', `${R}/diplomas/${dip.id}/termo-registro`); check('termo registro', r.status === 200 && r.text.includes('Registro de diploma'), r.status)
  r = await call(null, 'GET', `${PUB}/verificar/${(await prisma.secDiploma.findUnique({ where: { id: dip.id } }))!.codigoVerificacao}`); check('verificar diploma', r.json.valido === true && r.json.tipo === 'DIPLOMA', r)
  r = await call(sec, 'POST', `${R}/diplomas/${dip.id}/entregar`, { retiradoPor: 'Ca', retiradoDoc: '1' }); check('entregar dados curtos 400', r.status === 400, r)
  r = await call(sec, 'POST', `${R}/diplomas/${dip.id}/entregar`, { retiradoPor: 'Carla Lima', retiradoDoc: '12345678' }); check('entregar', r.status === 200 && r.json.status === 'ENTREGUE', r)
  r = await call(sec, 'POST', `${R}/diplomas/${dip.id}/transitar`, { para: 'CANCELADO', motivo: 'tentativa' }); check('cancelar entregue 409', r.status === 409, r)
  r = await call(sec, 'POST', `${R}/diplomas`, { studentId: st.id, tipo: 'SEGUNDA_VIA' }); check('2a via ok apos entrega', r.status === 201, r)
  r = await call(coord, 'POST', `${R}/livros/${livro.id}/encerrar`); check('encerrar livro', r.status === 200, r)
  r = await call(coord, 'GET', `${R}/livros/${livro.id}/termo`); check('termo livro', r.status === 200, r.status)
  r = await call(coord, 'POST', `${R}/diplomas/${(await call(sec, 'GET', `${R}/diplomas?status=SOLICITADO`)).json.items[0].id}/registrar`, { livroId: livro.id }); check('registrar com livro encerrado 409', r.status === 409, r)

  // ===== Colação =====
  r = await call(coord, 'POST', `${R}/colacoes`, { nome: 'Colação 2026/1', data: futuro(25), local: 'Auditório', programId: program.id, prazoInscricaoEm: futuro(10) }); check('colacao criada', r.status === 201, r)
  const col = r.json
  check('lembretes colacao', (await prisma.eduReminder.count({ where: { tenantId: A.tenantId, refType: 'SecColacao', refId: col.id } })) >= 3)
  r = await call(coord, 'POST', `${R}/colacoes`, { nome: 'Colação X Y', data: futuro(25), programId: (await prisma.academicProgram.create({ data: { tenantId: B.tenantId, nome: 'PB', modalidade: 'EAD', cargaHorariaTotal: 1 } })).id }); check('colacao com curso de outro tenant 404', r.status === 404, r)
  r = await call(coord, 'PUT', `${R}/colacoes/${col.id}`, { nome: 'Colação 2026/1 (rev)' }); check('editar colacao', r.status === 200, r)
  r = await call(sec, 'POST', `${R}/colacoes/${col.id}/formandos`, { studentIds: [st.id, st2.id, stB.id] }); check('inscrever formandos', r.status === 201 && r.json.incluidos === 2 && r.json.erros.length === 1, r)
  r = await call(sec, 'POST', `${R}/colacoes/${col.id}/formandos`, { incluirConcluintesDoCurso: true }); console.log('concluintes ->', r.status, r.json.incluidos)
  r = await call(sec, 'GET', `${R}/colacoes/${col.id}/formandos`); const fm = r.json.formandos
  const fCarla = fm.find((f: any) => f.studentId === st.id), fPedro = fm.find((f: any) => f.studentId === st2.id)
  check('Carla APTA, Pedro PENDENTE', fCarla.status === 'APTO' && fPedro.status === 'PENDENTE', [fCarla.status, fCarla.pendencias, fPedro.status, fPedro.pendencias])
  r = await call(sec, 'PATCH', `${R}/colacoes/${col.id}/formandos/${fCarla.id}`, { status: 'COLOU' }); check('colar antes de realizar 409', r.status === 409, r)
  r = await call(coord, 'POST', `${R}/colacoes/${col.id}/status`, { para: 'REALIZADA' }); check('PLANEJADA->REALIZADA 409', r.status === 409, r)
  r = await call(coord, 'POST', `${R}/colacoes/${col.id}/status`, { para: 'CONVOCADA' }); check('convocar', r.status === 200, r)
  check('notificacoes convocacao', (await prisma.eduNotification.count({ where: { tenantId: A.tenantId, templateKey: 'sec.colacao.convocacao' } })) >= 2)
  r = await call(coord, 'POST', `${R}/colacoes/${col.id}/ata`, {}); check('ata antes de realizar 409', r.status === 409, r)
  r = await call(coord, 'POST', `${R}/colacoes/${col.id}/status`, { para: 'REALIZADA' }); check('realizada', r.status === 200, r)
  r = await call(sec, 'PATCH', `${R}/colacoes/${col.id}/formandos/${fPedro.id}`, { status: 'COLOU' }); check('pendente nao cola 409', r.status === 409, r)
  r = await call(sec, 'PATCH', `${R}/colacoes/${col.id}/formandos/${fCarla.id}`, { status: 'COLOU', juramento: true }); check('Carla colou', r.status === 200, r)
  r = await call(sec, 'PATCH', `${R}/colacoes/${col.id}/formandos/${fPedro.id}`, { status: 'AUSENTE' }); check('Pedro ausente', r.status === 200, r)
  r = await call(coord, 'POST', `${R}/colacoes/${col.id}/status`, { para: 'ENCERRADA' }); check('encerrar sem ata 409', r.status === 409, r)
  const ataR = await Promise.all([1, 2].map(() => call(coord, 'POST', `${R}/colacoes/${col.id}/ata`, { gerarDiplomas: true })))
  check('ata simultanea: 1 sucesso', ataR.filter((x) => x.status === 201).length === 1, ataR.map((x) => x.status))
  check('1 ata criada', (await prisma.secAta.count({ where: { tenantId: A.tenantId, colacaoId: col.id } })) === 1)
  r = await call(coord, 'POST', `${R}/colacoes/${col.id}/status`, { para: 'ENCERRADA' }); check('encerrar colacao', r.status === 200, r)
  r = await call(coord, 'GET', `${R}/colacoes/${col.id}/lista`); check('lista formandos html', r.status === 200, r.status)
  r = await call(coord, 'GET', `${R}/atas`); check('atas', r.status === 200 && r.json.total >= 1, r)
  const ata = r.json.items[0]
  r = await call(coord, 'GET', `${R}/atas/${ata.id}/html`); check('ata html', r.status === 200 && r.text.includes('Carla Formanda Lima'), r.status)
  r = await call(coord, 'PUT', `${R}/atas/${ata.id}`, { livroId: 'zzz' }); check('editar ata nao troca livro', r.status === 200 && r.json.livroId === ata.livroId, r)

  // ===== Arquivo =====
  r = await call(sec, 'GET', `${R}/temporalidade?pageSize=100`); const tmp = r.json.items.find((t: any) => t.codigo === 'PROVAS_TRABALHOS'); const tmpPerm = r.json.items.find((t: any) => t.codigo === 'ATA_COLACAO')
  r = await call(sec, 'POST', `${R}/arquivo`, { temporalidadeId: tmp.id, titulo: 'Provas P1 2020', dataEncerramento: new Date(Date.now() - 4 * 365 * 86400000).toISOString(), caixa: 'C-1', estante: 'E1' }); check('arquivo item eliminavel (vencido)', r.status === 201 && r.json.status === 'ELEGIVEL_DESCARTE', r)
  const ai = r.json
  r = await call(sec, 'POST', `${R}/arquivo`, { temporalidadeId: tmpPerm.id, titulo: 'Atas 2010', dataEncerramento: new Date(Date.now() - 4 * 365 * 86400000).toISOString() }); check('permanente nao elegivel', r.json.status === 'GUARDA_PERMANENTE' && r.json.eliminarApos === null, r)
  r = await call(sec, 'POST', `${R}/arquivo`, { temporalidadeId: tmp.id, titulo: 'Recente', dataEncerramento: new Date().toISOString() }); check('item recente ATIVO', r.json.status === 'ATIVO', r); const rec = r.json
  r = await call(sec, 'POST', `${R}/arquivo`, { temporalidadeId: 'xx', titulo: 'Inválido', dataEncerramento: new Date().toISOString() }); check('temporalidade inexistente 404', r.status === 404, r)
  r = await call(sec, 'POST', `${R}/arquivo`, { temporalidadeId: tmp.id, titulo: 'Aluno alheio', studentId: stB.id, dataEncerramento: new Date().toISOString() }); check('arquivo aluno outro tenant 404', r.status === 404, r)
  r = await call(sec, 'GET', `${R}/arquivo-busca?q=C-1`); check('busca arquivo', r.status === 200 && r.json.items[0]?.localizacao.includes('Caixa'), r)
  r = await call(sec, 'POST', `${R}/descartes`, { itemIds: [rec.id], justificativa: 'Teste de descarte' }); check('descarte item nao elegivel 409', r.status === 409, r)
  r = await call(sec, 'POST', `${R}/descartes`, { itemIds: [ai.id], justificativa: 'Prazo vencido na temporalidade' }); check('solicitar descarte', r.status === 201 && /^\d{4}\/\d{4}$/.test(r.json.numero), r)
  const desc = r.json
  r = await call(sec, 'POST', `${R}/descartes`, { itemIds: [ai.id], justificativa: 'Duplicado' }); check('item ja em descarte 409', r.status === 409, r)
  r = await call(sec, 'DELETE', `${R}/arquivo/${ai.id}`); check('nao apaga item em descarte 409', r.status === 409, r)
  r = await call(sec, 'PUT', `${R}/arquivo/${ai.id}`, { titulo: 'Mudou' }); check('nao edita item em descarte 409', r.status === 409, r)
  r = await call(sec, 'POST', `${R}/descartes/${desc.id}/aprovar`); check('SECRETARY nao aprova 403', r.status === 403, r.status)
  r = await call(A.users.ADMIN.token, 'POST', `${R}/descartes`, { itemIds: [rec.id], justificativa: 'ADMIN solicita' }); check('ADMIN solicita item nao elegivel 409', r.status === 409, r.status)
  r = await call(B.users.COORDINATOR.token, 'POST', `${R}/descartes/${desc.id}/aprovar`); check('aprovar outro tenant 404', r.status === 404, r.status)
  r = await call(coord, 'POST', `${R}/descartes/${desc.id}/executar`); check('executar sem aprovar 409', r.status === 409, r)
  r = await call(coord, 'POST', `${R}/descartes/${desc.id}/aprovar`); check('aprovar', r.status === 200, r)
  r = await call(coord, 'POST', `${R}/descartes/${desc.id}/executar`); check('executar', r.status === 200 && r.json.itens === 1, r)
  r = await call(coord, 'GET', `${R}/descartes/${desc.id}/termo`); check('termo', r.status === 200 && r.text.includes('Provas P1 2020'), r.status)
  r = await call(coord, 'POST', `${R}/arquivo/${rec.id}/suspender`, { motivo: 'Processo judicial em curso' }); check('suspender', r.status === 200 && r.json.status === 'SUSPENSO', r)
  r = await call(coord, 'POST', `${R}/arquivo/${rec.id}/retomar`); check('retomar', r.status === 200 && r.json.status === 'ATIVO', r)
  // self-approval por COORDINATOR que solicitou (ADMIN cria p/ coord?) -> coord solicita via ADMIN role
  r = await call(sec, 'POST', `${R}/arquivo-reclassificar`); check('reclassificar', r.status === 200, r)

  // ===== Situação do aluno =====
  r = await call(sec, 'GET', `${R}/alunos?q=Carla`); check('busca alunos', r.status === 200 && r.json.total === 1, r)
  r = await call(sec, 'GET', `${R}/alunos/${st.id}/situacao`); check('situacao', r.status === 200 && r.json.aluno.cpf?.includes('***'), r)
  r = await call(sec, 'GET', `${R}/alunos/${st.id}/situacao/html`); check('situacao html', r.status === 200, r.status)
  r = await call(sec, 'GET', `${R}/alunos/${stB.id}/situacao`); check('situacao outro tenant 404', r.status === 404, r.status)
  r = await call(A.users.STUDENT.token, 'GET', `${R}/alunos?q=Carla`); check('aluno nao busca alunos 403', r.status === 403, r.status)

  // ===== jobs =====
  const { runEduJobs } = await import('../../src/modules/core/jobs')
  await prisma.secColacao.create({ data: { tenantId: A.tenantId, nome: 'Colação antiga', data: new Date(Date.now() - 5 * 86400000), status: 'CONVOCADA' } })
  await prisma.secColacao.create({ data: { tenantId: A.tenantId, nome: 'Colação próxima', data: new Date(Date.now() + 5 * 86400000), status: 'PLANEJADA', programId: program.id } })
  await prisma.secDiploma.updateMany({ where: { tenantId: A.tenantId, status: 'SOLICITADO' }, data: { status: 'PENDENCIA', pendencias: ['Falta doc'], updatedAt: new Date(Date.now() - 30 * 86400000) } })
  const j: any = await runEduJobs()
  check('jobs sec ok', Object.values(j).every((x: any) => x.ok), Object.entries(j).filter(([, x]: any) => !x.ok))
  console.log('jobs', JSON.stringify(j['secretaria.colacoes']), JSON.stringify(j['secretaria.diplomas']), JSON.stringify(j['secretaria.arquivo']))
  resumo(); server.close(); await prisma.$disconnect(); process.exit(fails.length ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })

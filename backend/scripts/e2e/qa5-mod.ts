import { setup, check, summary, prisma } from './qa5-lib'
import { runEduJobs } from '../../src/modules/core/jobs'

const d = (n: number, h = 12) => { const x = new Date(Date.now() + n * 864e5); x.setUTCHours(h, 0, 0, 0); return x.toISOString() }
async function main() {
  const { call, t1, t2, close } = await setup()
  const admin = await t1.mk('ADMIN'), coord = await t1.mk('COORDINATOR'), sec = await t1.mk('SECRETARY'), tch = await t1.mk('TEACHER'), fin = await t1.mk('FINANCE'), sup = await t1.mk('SUPPORT')
  const studs: any[] = []; for (let i = 0; i < 6; i++) studs.push(await t1.mk('STUDENT', true))
  const [s1, s2, s3] = studs
  const admB = await t2.mk('ADMIN'), coordB = await t2.mk('COORDINATOR')
  const M = '/edu/modalidades'
  let r = await call(coord, 'POST', M + '/bootstrap', {}); check('boot', r.status === 200, r.text)
  r = await call(coord, 'POST', M + '/bootstrap', {}); check('boot idempotente', r.status === 200, r.text)
  r = await call(s1, 'POST', M + '/bootstrap', {}); check('boot aluno 403', r.status === 403)
  r = await call(tch, 'PUT', M + '/config', { alunosPorTutorEad: 10 }); check('config prof 403', r.status === 403)
  r = await call(coord, 'PUT', M + '/config', { diasInatividadeAtencao: 20, diasInatividadeCritico: 10 }); check('config incoerente 400', r.status === 400, r.text)
  r = await call(coord, 'PUT', M + '/config', { alunosPorTutorEad: 3 }); check('config', r.status === 200, r.text)

  // ---- currículo
  const mkProg = async (nome: string, mod: string, ch: number) => prisma.academicProgram.create({ data: { tenantId: t1.tenantId, nome, modalidade: mod as any, cargaHorariaTotal: ch } })
  const ead = await mkProg('Curso EAD', 'EAD', 200), pres = await mkProg('Curso Presencial', 'PRESENCIAL', 200), semi = await mkProg('Curso Semi', 'SEMIPRESENCIAL', 200)
  const discs: any[] = []
  for (let i = 0; i < 2; i++) discs.push(await prisma.discipline.create({ data: { tenantId: t1.tenantId, nome: 'Disc ' + i, cargaHoraria: 100 } }))
  for (const p of [ead, pres, semi]) for (const [i, dc] of discs.entries()) await prisma.curriculumDiscipline.create({ data: { programId: p.id, disciplineId: dc.id, periodo: i + 1 } })
  r = await call(coord, 'GET', M + `/conformidade/programas/${ead.id}`); check('conformidade EAD sem ofertas não conforme', r.status === 200 && r.json.conforme === false, r.text)
  console.log('  EAD alertas:', r.json?.alertas?.map((a: any) => a.codigo))
  r = await call(coord, 'GET', M + `/conformidade/programas/${pres.id}`); check('conformidade presencial', r.status === 200 && r.json.conforme === true, r.text)
  r = await call(admB, 'GET', M + `/conformidade/programas/${pres.id}`); check('conformidade tenant B 404', r.status === 404, r.text)
  // oferta
  r = await call(coord, 'POST', M + '/ofertas', { disciplineId: discs[0].id, programId: ead.id, modalidade: 'EAD', cargaPresencial: 10, cargaOnline: 50 }); check('oferta carga != disciplina 422', r.status === 422, r.text)
  r = await call(coord, 'POST', M + '/ofertas', { disciplineId: discs[0].id, programId: pres.id, modalidade: 'PRESENCIAL', cargaPresencial: 40, cargaOnline: 60 }); check('presencial >40% EAD 422', r.status === 422, r.text)
  r = await call(coord, 'POST', M + '/ofertas', { disciplineId: discs[0].id, programId: ead.id, modalidade: 'EAD', cargaPresencial: 10, cargaOnline: 90, minEncontros: 1, avaliacoesPresenciais: 1 }); check('oferta ead 1', r.status === 201, r.text); const of1 = r.json
  r = await call(coord, 'POST', M + '/ofertas', { disciplineId: discs[1].id, programId: ead.id, modalidade: 'EAD', cargaPresencial: 10, cargaOnline: 90 }); check('oferta ead 2', r.status === 201, r.text)
  r = await call(admB, 'POST', M + '/ofertas', { disciplineId: discs[1].id, modalidade: 'EAD', cargaPresencial: 10, cargaOnline: 90 }); check('oferta disciplina de outro tenant 404', r.status === 404, r.text)
  r = await call(tch, 'POST', M + '/ofertas', { disciplineId: discs[1].id, modalidade: 'EAD', cargaPresencial: 10, cargaOnline: 90 }); check('prof nao cria oferta 403', r.status === 403)
  r = await call(coord, 'GET', M + `/conformidade/programas/${ead.id}?registrar=true`); check('conformidade registrada', r.status === 200, r.text)
  console.log('  EAD alertas:', r.json?.alertas?.map((a: any) => a.codigo), 'conforme', r.json?.conforme)
  r = await call(coord, 'POST', M + '/conformidade/simular', { modalidade: 'SEMIPRESENCIAL', disciplinas: [{ id: 'a', nome: 'A', cargaPresencial: 10, cargaOnline: 90 }] }); check('simular semi nao conforme', r.status === 200 && r.json.conforme === false, r.text)
  r = await call(coord, 'GET', M + '/conformidade'); check('conformidade geral', r.status === 200, r.text)
  r = await call(tch, 'GET', M + '/relatorios/conformidade'); check('relatorio html', r.status === 200 && r.text.includes('<table'), r.status)
  // encontros
  const space = await prisma.eduSpace.create({ data: { tenantId: t1.tenantId, codigo: 'S1', nome: 'Sala 1', tipo: 'SALA_AULA', capacidade: 30 } })
  r = await call(coord, 'POST', M + '/encontros', { ofertaId: of1.id, tipo: 'ENCONTRO_PRESENCIAL', titulo: 'Encontro 1', inicio: d(5, 10), fim: d(5, 12), spaceId: space.id }); check('encontro', r.status === 201, r.text); const enc = r.json
  r = await call(coord, 'POST', M + '/encontros', { ofertaId: of1.id, tipo: 'PROVA_PRESENCIAL', titulo: 'Prova', inicio: d(5, 11), fim: d(5, 13), spaceId: space.id }); check('conflito de espaço 409', r.status === 409, r.text)
  r = await call(coord, 'POST', M + '/encontros', { ofertaId: of1.id, tipo: 'PROVA_PRESENCIAL', titulo: 'Prova', inicio: d(6, 13), fim: d(6, 10) }); check('fim<inicio 422', r.status === 422, r.text)
  r = await call(coord, 'POST', M + '/encontros', { ofertaId: of1.id, tipo: 'PROVA_PRESENCIAL', titulo: 'Prova', inicio: d(7, 10), fim: d(7, 12) }); check('prova', r.status === 201, r.text); const prova = r.json
  r = await call(coord, 'POST', M + `/encontros/${enc.id}/cancelar`, {}); check('cancelar encontro', r.status === 200, r.text)
  r = await call(coord, 'POST', M + `/encontros/${enc.id}/realizar`, {}); check('realizar cancelado 409', r.status === 409, r.text)
  r = await call(coord, 'POST', M + `/encontros/${enc.id}/cancelar`, {}); check('cancelar 2x 409', r.status === 409, r.text)
  const remEnc = await prisma.eduReminder.count({ where: { tenantId: t1.tenantId, refType: 'ModEncontro', status: 'CANCELADO' } }); check('lembrete do encontro cancelado', remEnc >= 1, remEnc)
  // ---- lives e presença
  r = await call(tch, 'POST', M + '/lives', { titulo: 'Aula ao vivo', professorUserId: tch.id, inicio: new Date(Date.now() - 3600e3).toISOString(), fim: new Date(Date.now() + 3600e3).toISOString(), ofertaId: of1.id }); check('live', r.status === 201, r.text); const live = r.json
  r = await call(tch, 'POST', M + `/lives/${live.id}/iniciar`, {}); check('iniciar', r.status === 200, r.text)
  r = await call(tch, 'POST', M + `/lives/${live.id}/iniciar`, {}); check('iniciar 2x 409', r.status === 409, r.text)
  r = await call(s1, 'POST', M + `/lives/${live.id}/eventos`, { tipo: 'ENTRADA', em: new Date(Date.now() - 3600e3).toISOString() }); check('aluno entra', r.status === 201, r.text)
  const evS1 = await prisma.modLiveEvento.findFirst({ where: { liveId: live.id, studentId: s1.studentId } })
  check('aluno NAO pode forjar horario de entrada', evS1 && Date.now() - evS1.em.getTime() < 60_000, evS1?.em)
  r = await call(s2, 'POST', M + `/lives/${live.id}/eventos`, { tipo: 'ENTRADA' }); check('aluno2 entra', r.status === 201, r.text)
  r = await call(s2, 'POST', M + `/lives/${live.id}/eventos`, { studentId: s3.studentId, tipo: 'ENTRADA' }); check('aluno nao registra por outro', r.status === 201, r.text)
  const evS3 = await prisma.modLiveEvento.count({ where: { liveId: live.id, studentId: s3.studentId } }); check('evento nao vai para outro aluno', evS3 === 0, evS3)
  r = await call(fin, 'POST', M + `/lives/${live.id}/eventos`, { studentId: s3.studentId, tipo: 'ENTRADA' }); check('financeiro 403 eventos', r.status === 403, r.status)
  r = await call(tch, 'POST', M + `/lives/${live.id}/encerrar`, { gravacaoUrl: 'https://x.com/rec' }); check('encerrar live', r.status === 200, r.text)
  r = await call(tch, 'POST', M + `/lives/${live.id}/encerrar`, {}); check('encerrar 2x 409', r.status === 409, r.text)
  r = await call(tch, 'GET', M + `/lives/${live.id}/presencas`); check('presencas', r.status === 200 && r.json.length === 2, r.text)
  r = await call(tch, 'PUT', M + `/lives/${live.id}/presencas/${s1.studentId}`, { presente: true }); check('presenca manual', r.status === 200, r.text)
  r = await call(s1, 'GET', M + `/lives/${live.id}/minha-presenca`); check('minha presenca', r.status === 200, r.text)
  r = await call(s1, 'GET', M + '/minha-agenda'); check('minha agenda', r.status === 200, r.text)
  // ---- polos
  r = await call(coord, 'POST', M + '/polos', { codigo: 'P01', nome: 'Polo Centro', cidade: 'Recife', uf: 'PE', capacidade: 2 }); check('polo', r.status === 201, r.text); const polo = r.json
  r = await call(coord, 'POST', M + '/polos', { codigo: 'P01', nome: 'Polo Dup' }); check('polo codigo dup 4xx', r.status >= 400 && r.status < 500, r.text)
  r = await call(coord, 'POST', M + `/polos/${polo.id}/credenciar`, { atoNumero: 'Port 1', atoData: d(-10) }); check('credenciar sem checklist 422', r.status === 422, r.text)
  r = await call(coord, 'POST', M + `/polos/${polo.id}/alunos`, { studentId: s1.studentId }); check('aluno em polo nao credenciado 422', r.status === 422, r.text)
  const ck = await prisma.modPoloChecklistItem.findMany({ where: { poloId: polo.id } }); check('checklist criado', ck.length > 0, ck.length)
  for (const it of ck.filter((x) => x.obrigatorio)) await call(coord, 'PUT', M + `/polos/${polo.id}/checklist/${it.chave}`, { atendido: true })
  r = await call(coord, 'POST', M + `/polos/${polo.id}/credenciar`, { atoNumero: 'Port 1', atoData: d(-10), atoValidade: d(90) }); check('credenciar', r.status === 200, r.text)
  const al = await Promise.all([s1, s2, s3].map((s) => call(sec, 'POST', M + `/polos/${polo.id}/alunos`, { studentId: s.studentId })))
  check('capacidade do polo (2) com concorrencia', al.filter((x) => x.status === 201).length === 2 && (await prisma.modPoloAluno.count({ where: { poloId: polo.id, ativo: true } })) === 2, al.map((x) => x.status))
  r = await call(coord, 'POST', M + '/polo-ofertas', { poloId: polo.id, programId: ead.id, vagas: 5 }); check('polo oferta excede capacidade 422', r.status === 422, r.text)
  r = await call(coord, 'POST', M + '/polo-ofertas', { poloId: polo.id, programId: ead.id, vagas: 2 }); check('polo oferta', r.status === 201, r.text)
  r = await call(coord, 'GET', M + `/polos/${polo.id}/indicadores`); check('indicadores polo', r.status === 200, r.text)
  r = await call(admB, 'GET', M + `/polos/${polo.id}/indicadores`); check('polo tenant B 404', r.status === 404)
  r = await call(coord, 'POST', M + `/polos/${polo.id}/suspender`, { motivo: 'obras' }); check('suspender polo', r.status === 200, r.text)
  r = await call(sec, 'POST', M + `/polos/${polo.id}/alunos`, { studentId: studs[4].studentId }); check('suspenso nao recebe aluno 422', r.status === 422, r.text)
  const pubr = await call(null, 'GET', `/public/edu/modalidades/polos?tenantId=${t1.tenantId}`); check('publico polos (suspenso fora)', pubr.status === 200 && pubr.json.length === 0, pubr.text)
  r = await call(coord, 'PUT', M + `/polos/${polo.id}`, { statusCredenciamento: 'CREDENCIADO' }); console.log('  reativar via PUT:', r.status)
  const pubr2 = await call(null, 'GET', `/public/edu/modalidades/polos?tenantId=${t1.tenantId}`); check('publico polos nao vaza e-mail de usuário (so campos esperados)', pubr2.status === 200 && pubr2.json.every((p: any) => !('atoNumero' in p) && !('responsavelUserId' in p)), pubr2.text)
  // ---- tutoria
  r = await call(coord, 'POST', M + '/tutores', { nome: 'Tutor Um', userId: tch.id, tipo: 'DISTANCIA', capacidadeAlunos: 3 }); check('tutor', r.status === 201, r.text); const tut = r.json
  r = await call(coord, 'POST', M + '/tutores', { nome: 'Tutor Pres', tipo: 'PRESENCIAL' }); const tutP = r.json
  r = await call(coord, 'POST', M + '/alocacoes', { tutorId: tutP.id, programId: ead.id }); check('tutor presencial sem polo 422', r.status === 422, r.text)
  r = await call(coord, 'POST', M + '/alocacoes', { tutorId: tut.id }); check('alocacao sem alvo 422', r.status === 422, r.text)
  r = await call(coord, 'POST', M + '/alocacoes', { tutorId: tut.id, programId: ead.id, alunosPrevistos: 4 }); check('capacidade do tutor 422', r.status === 422, r.text)
  r = await call(coord, 'POST', M + '/alocacoes', { tutorId: tut.id, programId: ead.id, poloId: polo.id, alunosPrevistos: 3 }); check('alocacao', r.status === 201, r.text)
  r = await call(coord, 'GET', M + `/relacao-aluno-tutor?programId=${ead.id}`); check('relacao aluno tutor', r.status === 200, r.text)
  r = await call(s1, 'POST', M + '/atendimentos', { assunto: 'Dúvida na atividade', mensagem: 'Não consegui acessar', prioridade: 'URGENTE' }); check('atendimento aluno', r.status === 201 && r.json.tutor?.id === tut.id, r.text); const at = r.json
  console.log('  tutor escolhido:', r.json?.tutor?.nome)
  r = await call(s2, 'GET', M + `/atendimentos/${at.id}`); check('aluno2 nao ve atendimento 404', r.status === 404, r.status)
  r = await call(s1, 'GET', M + '/atendimentos'); check('aluno lista so seus', r.status === 200 && r.json.items.every((x: any) => x.studentId === s1.studentId), r.text)
  r = await call(s1, 'POST', M + `/atendimentos/${at.id}/encerrar`, {}); check('aluno encerra o proprio', r.status === 200, r.text)
  r = await call(s1, 'POST', M + `/atendimentos/${at.id}/mensagens`, { texto: 'obrigado' }); check('mensagem em encerrado 409', r.status === 409, r.text)
  r = await call(s1, 'POST', M + '/atendimentos', { assunto: 'Outra dúvida', mensagem: 'Preciso de ajuda' }); const at2 = r.json
  r = await call(tch, 'POST', M + `/atendimentos/${at2.id}/encerrar`, {}); check('encerrar sem responder 422', r.status === 422, r.text)
  r = await call(tch, 'POST', M + `/atendimentos/${at2.id}/mensagens`, { texto: 'Claro, vou ajudar' }); check('tutor responde', r.status === 201, r.text)
  const a2 = await prisma.modAtendimento.findUnique({ where: { id: at2.id } }); check('SLA cumprido + status RESPONDIDO', a2?.slaCumprido === true && a2.status === 'RESPONDIDO', a2)
  r = await call(s1, 'POST', M + '/atendimentos', { assunto: 'Terceira dúvida', mensagem: 'Preciso de ajuda' }); const at3 = r.json
  await prisma.modAtendimento.update({ where: { id: at3.id }, data: { slaLimite: new Date(Date.now() - 3600e3) } })
  r = await call(s1, 'POST', M + `/tutores/${tut.id}/avaliacoes`, { nota: 5, atendimentoId: at2.id }); check('avaliar tutor', r.status === 201, r.text)
  r = await call(s1, 'POST', M + `/tutores/${tut.id}/avaliacoes`, { nota: 5, atendimentoId: at2.id }); check('avaliar 2x 409', r.status === 409, r.text)
  r = await call(s2, 'POST', M + `/tutores/${tut.id}/avaliacoes`, { nota: 5 }); check('avaliar sem atendimento 422', r.status === 422, r.text)
  r = await call(s1, 'POST', M + `/tutores/${tut.id}/avaliacoes`, { nota: 9 }); check('nota invalida 400', r.status === 400, r.text)
  r = await call(coord, 'GET', M + `/tutores/${tut.id}/desempenho`); check('desempenho', r.status === 200, r.text)
  // ---- engajamento
  r = await call(s1, 'POST', M + '/engajamento/eventos', { tipo: 'LOGIN', duracaoSeg: 600 }); check('evento engajamento', r.status === 201, r.text)
  r = await call(s1, 'POST', M + '/engajamento/eventos', { tipo: 'LOGIN', ocorridoEm: new Date(Date.now() + 5 * 864e5).toISOString() }); check('evento futuro aceito como agora', r.status === 201, r.text)
  const fut = await prisma.modEngajamentoEvento.findMany({ where: { studentId: s1.studentId } }); check('evento futuro clampado', fut.every((e) => e.ocorridoEm.getTime() <= Date.now() + 61_000), fut.map((e) => e.ocorridoEm))
  r = await call(fin, 'POST', M + '/engajamento/eventos', { tipo: 'LOGIN', studentId: s1.studentId }); check('engajamento finance 403', r.status === 403)
  r = await call(coord, 'POST', M + '/engajamento/eventos', { tipo: 'LOGIN' }); check('staff sem studentId 400', r.status === 400, r.text)
  r = await call(s1, 'GET', M + `/engajamento/alunos/${s2.studentId}`); check('aluno ve proprio risco (ignora param)', r.status === 200 && r.json.studentId === s1.studentId, r.text)
  // matricula ativa em curso EAD p/ job de inatividade
  const term = await prisma.academicTerm.create({ data: { tenantId: t1.tenantId, codigo: '2026/2', dataInicio: new Date(), dataFim: new Date(Date.now() + 100 * 864e5) } })
  for (const s of [s2, s3]) await prisma.enrollment.create({ data: { studentId: s.studentId, programId: ead.id, status: 'ATIVA', termId: term.id } })
  // ---- práticas
  const ag = { tipo: 'AULA_PRATICA', titulo: 'Lab 1', inicio: d(3, 10), fim: d(3, 14), vagas: 2, spaceId: space.id }
  r = await call(coord, 'POST', M + '/agendas-praticas', ag); check('agenda pratica', r.status === 201, r.text); const agP = r.json
  r = await call(coord, 'POST', M + '/agendas-praticas', { ...ag, titulo: 'Lab conflito' }); check('espaco ocupado 409', r.status === 409, r.text)
  const ins = await Promise.all([s1, s2, s3].map((s) => call(s, 'POST', M + `/agendas-praticas/${agP.id}/inscrever`, {})))
  check('vagas da pratica (2) com concorrencia', ins.filter((x) => x.status === 201).length === 2 && (await prisma.modPraticaInscricao.count({ where: { agendaId: agP.id, status: { not: 'CANCELADO' } } })) === 2, ins.map((x) => x.status))
  const insOk = [s1, s2, s3].filter((_, i) => ins[i].status === 201)
  r = await call(insOk[0], 'POST', M + `/agendas-praticas/${agP.id}/inscrever`, {}); check('inscrever 2x 409', r.status === 409, r.text)
  const fech = await Promise.all([1, 2].map(() => call(coord, 'POST', M + `/agendas-praticas/${agP.id}/fechar`, { presentes: [insOk[0].studentId] })))
  const horas = await prisma.modHoraPratica.count({ where: { agendaId: agP.id } }); check('fechar agenda 2x concorrente nao duplica horas', horas === 1 && fech.filter((x) => x.status === 200).length === 1, { horas, st: fech.map((x) => x.status) })
  r = await call(coord, 'POST', M + `/agendas-praticas/${agP.id}/inscrever`, { studentId: s3.studentId }); check('inscrever em agenda fechada 409', r.status === 409, r.text)
  // estagio
  r = await call(coord, 'POST', M + '/estagios', { studentId: s1.studentId, concedente: 'Empresa X', horasExigidas: 10, inicio: d(-10), fim: d(30) }); check('estagio', r.status === 201, r.text); const est = r.json
  r = await call(s1, 'POST', M + `/estagios/${est.id}/horas`, { data: d(-2), horas: 13 }); check('horas > 12 400', r.status === 400 || r.status === 422, r.text)
  r = await call(s1, 'POST', M + `/estagios/${est.id}/horas`, { data: d(5), horas: 4 }); check('horas futuras 422', r.status === 422, r.text)
  r = await call(s1, 'POST', M + `/estagios/${est.id}/horas`, { data: d(-2), horas: 8 }); check('horas', r.status === 201, r.text); const h1 = r.json
  r = await call(s1, 'POST', M + `/estagios/${est.id}/horas`, { data: d(-2), horas: 6 }); check('limite 12h/dia 422', r.status === 422, r.text)
  r = await call(s2, 'POST', M + `/estagios/${est.id}/horas`, { data: d(-2), horas: 2 }); check('aluno2 em estagio alheio 404', r.status === 404, r.text)
  r = await call(coord, 'POST', M + `/estagios/${est.id}/concluir`, {}); check('concluir sem horas 422', r.status === 422, r.text)
  r = await call(tch, 'POST', M + `/horas/${h1.id}/validar`, { aprovar: false }); check('rejeitar sem motivo 422', r.status === 422, r.text)
  r = await call(tch, 'POST', M + `/horas/${h1.id}/validar`, { aprovar: true }); check('validar horas', r.status === 200, r.text)
  r = await call(tch, 'POST', M + `/horas/${h1.id}/validar`, { aprovar: true }); check('validar 2x 409', r.status === 409, r.text)
  r = await call(s1, 'POST', M + `/estagios/${est.id}/horas`, { data: d(-1), horas: 4 }); const h2 = r.json
  r = await call(coord, 'POST', M + `/horas/${h2.id}/validar`, { aprovar: true }); check('validar 2', r.status === 200)
  r = await call(coord, 'POST', M + `/estagios/${est.id}/concluir`, {}); check('concluir estagio', r.status === 200, r.text)
  r = await call(s1, 'GET', M + `/alunos/${s1.studentId}/horas`); check('horas do aluno', r.status === 200, r.text)
  // ---- pós
  r = await call(coord, 'POST', M + '/pos/programas', { codigo: 'LATO1', nome: 'Especialização em Gestão', nivel: 'ESPECIALIZACAO', cargaHoraria: 200, status: 'ATIVO' }); check('lato <360h ativo 422', r.status === 422, r.text)
  r = await call(coord, 'POST', M + '/pos/programas', { codigo: 'LATO1', nome: 'Especialização em Gestão', nivel: 'ESPECIALIZACAO', cargaHoraria: 360, status: 'ATIVO', exigeTcc: true }); check('lato', r.status === 201, r.text); const lato = r.json
  r = await call(coord, 'POST', M + '/pos/programas', { codigo: 'MEST1', nome: 'Mestrado em Educação', nivel: 'MESTRADO_ACADEMICO', status: 'ATIVO' }); check('stricto sem creditos 422', r.status === 422, r.text)
  r = await call(coord, 'POST', M + '/pos/programas', { codigo: 'MEST1', nome: 'Mestrado em Educação', nivel: 'MESTRADO_ACADEMICO', creditosMinimos: 24, status: 'ATIVO' }); check('stricto', r.status === 201, r.text); const mest = r.json
  r = await call(coord, 'POST', M + '/pos/programas', { codigo: 'MEST1', nome: 'Outro', nivel: 'MBA' }); check('pos codigo dup 4xx', r.status >= 400 && r.status < 500, r.text)
  r = await call(tch, 'POST', M + '/pos/programas', { codigo: 'X', nome: 'Xxx', nivel: 'MBA' }); check('prof nao cria pos 403', r.status === 403)
  r = await call(coord, 'POST', M + '/pos/docentes', { posId: mest.id, nome: 'Dra Orientadora', titulacao: 'MESTRE', orientador: true }); check('orientador mestre em stricto 422', r.status === 422, r.text)
  r = await call(coord, 'POST', M + '/pos/docentes', { posId: mest.id, nome: 'Dra Orientadora', titulacao: 'DOUTOR', orientador: true, capacidadeOrientandos: 1 }); check('orientadora', r.status === 201, r.text); const ori = r.json
  r = await call(coord, 'POST', M + '/pos/linhas', { posId: mest.id, nome: 'Linha 1' }); check('linha', r.status === 201, r.text)
  r = await call(coord, 'GET', M + `/pos/programas/${mest.id}/conformidade`); check('conformidade stricto', r.status === 200 && r.json.conforme === false, r.text)
  r = await call(coord, 'GET', M + `/pos/programas/${lato.id}/conformidade`); check('conformidade lato', r.status === 200, r.text)
  const ing = await Promise.all([s1, s2].map((s) => call(coord, 'POST', M + '/pos/alunos', { posId: mest.id, studentId: s.studentId, orientadorId: ori.id })))
  check('capacidade do orientador (1) com concorrencia', ing.filter((x) => x.status === 201).length === 1, ing.map((x) => x.status))
  const pa = ing.find((x) => x.status === 201)!.json
  const donoPa = studs.find((x) => x.studentId === pa.studentId), outroPa = studs.find((x) => x !== donoPa)
  r = await call(coord, 'POST', M + '/pos/alunos', { posId: mest.id, studentId: pa.studentId }); check('mesmo aluno duas vezes no programa', r.status === 409 || r.status === 422, r.status + ' ' + r.text.slice(0, 100))
  r = await call(coord, 'POST', M + '/pos/bancas', { alunoId: pa.id, tipo: 'DEFESA', dataHora: d(10), membros: [{ nome: 'A' }, { nome: 'B' }, { nome: 'C' }] }); check('defesa sem qualificacao 422', r.status === 422, r.text)
  r = await call(coord, 'POST', M + '/pos/bancas', { alunoId: pa.id, tipo: 'QUALIFICACAO', dataHora: d(5), membros: [{ nome: 'A' }] }); check('banca qualificacao', r.status === 201, r.text); const bq = r.json
  r = await call(coord, 'POST', M + `/pos/bancas/${bq.id}/resultado`, { resultado: 'APROVADO' }); check('resultado qualificacao', r.status === 200, r.text)
  r = await call(coord, 'POST', M + `/pos/bancas/${bq.id}/resultado`, { resultado: 'APROVADO' }); check('resultado 2x 409', r.status === 409, r.text)
  r = await call(coord, 'POST', M + '/pos/bancas', { alunoId: pa.id, tipo: 'DEFESA', dataHora: d(10), membros: [{ nome: 'A' }, { nome: 'B' }] }); check('defesa mestrado <3 membros 422', r.status === 422, r.text)
  r = await call(coord, 'POST', M + '/pos/bancas', { alunoId: pa.id, tipo: 'DEFESA', dataHora: d(10), membros: [{ nome: 'A' }, { nome: 'B' }, { nome: 'C' }] }); const bd = r.json; check('banca defesa', r.status === 201, r.text)
  r = await call(coord, 'POST', M + `/pos/alunos/${pa.id}/titular`, {}); check('titular sem pendencias resolvidas 422', r.status === 422, r.text)
  r = await call(coord, 'POST', M + `/pos/alunos/${pa.id}/situacao`, { status: 'TRANCADO', motivo: 'saúde' }); check('trancar', r.status === 200, r.text)
  r = await call(coord, 'POST', M + `/pos/bancas/${bd.id}/resultado`, { resultado: 'APROVADO' }); const pa2 = await prisma.modPosAluno.findUnique({ where: { id: pa.id } })
  check('resultado de banca NAO reativa aluno trancado', pa2?.status === 'TRANCADO', { st: r.status, status: pa2?.status })
  r = await call(coord, 'POST', M + `/pos/alunos/${pa.id}/situacao`, { status: 'MATRICULADO', motivo: 'retorno' }); check('reativar', r.status === 200, r.text)
  r = await call(coord, 'POST', M + `/pos/bancas/${bd.id}/resultado`, { resultado: 'APROVADO' }); check('resultado defesa', r.status === 200 || r.status === 409 || r.status === 422, r.text)
  await prisma.modPosAluno.update({ where: { id: pa.id }, data: { creditosCumpridos: 24 } })
  r = await call(coord, 'POST', M + `/pos/alunos/${pa.id}/depositar`, {}); check('depositar', r.status === 200, r.text)
  r = await call(coord, 'POST', M + `/pos/alunos/${pa.id}/titular`, {}); check('titular', r.status === 200 && r.json.status === 'TITULADO', r.text)
  r = await call(coord, 'POST', M + `/pos/alunos/${pa.id}/titular`, {}); check('titular 2x 409', r.status === 409, r.text)
  r = await call(donoPa, 'GET', M + `/pos/alunos/${pa.id}/certificado`); check('certificado (aluno ve o proprio)', r.status === 200 && r.text.includes('Diploma'), r.status)
  r = await call(outroPa, 'GET', M + `/pos/alunos/${pa.id}/certificado`); check('certificado alheio 404', r.status === 404, r.status)
  r = await call(coord, 'POST', M + `/pos/alunos/${pa.id}/situacao`, { status: 'DESLIGADO', motivo: 'xx yy' }); check('titulado nao muda situacao 409', r.status === 409, r.text)
  r = await call(coord, 'POST', M + '/pos/bolsas', { alunoId: pa.id, agencia: 'CAPES', valorMensal: 2200, inicio: d(0), fim: d(300) }); check('bolsa em titulado 422', r.status === 422, r.text)
  // bolsa em outro aluno lato
  r = await call(coord, 'POST', M + '/pos/alunos', { posId: lato.id, studentId: s3.studentId }); check('aluno lato', r.status === 201, r.text); const pl = r.json
  r = await call(fin, 'POST', M + '/pos/bolsas', { alunoId: pl.id, agencia: 'CAPES', valorMensal: 1000, inicio: d(0), fim: d(300) }); check('CAPES em lato 422', r.status === 422, r.text)
  r = await call(fin, 'POST', M + '/pos/bolsas', { alunoId: pl.id, agencia: 'INSTITUCIONAL', valorMensal: 1000, inicio: d(0), fim: d(300) }); check('bolsa institucional', r.status === 201, r.text); const bolsa = r.json
  r = await call(fin, 'POST', M + `/pos/bolsas/${bolsa.id}/situacao`, { status: 'ENCERRADA' }); check('encerrar bolsa', r.status === 200, r.text)
  r = await call(fin, 'POST', M + `/pos/bolsas/${bolsa.id}/situacao`, { status: 'ATIVA' }); check('reativar bolsa encerrada 409', r.status === 409, r.text)
  r = await call(coord, 'POST', M + '/pos/turmas', { posId: lato.id, codigo: 'T1', inicio: d(10), vagas: 1 }); const tur = r.json; check('turma', r.status === 201, r.text)
  const ing2 = await Promise.all([studs[3], studs[4]].map((s) => call(coord, 'POST', M + '/pos/alunos', { posId: lato.id, studentId: s.studentId, turmaId: tur.id })))
  check('vagas da turma (1) com concorrencia', ing2.filter((x) => x.status === 201).length === 1, ing2.map((x) => x.status))
  r = await call(coord, 'POST', M + '/pos/ofertas', { posId: lato.id, titulo: 'Oferta Especialização', vagas: 10 }); check('oferta pos', r.status === 201, r.text); const ofp = r.json
  r = await call(coord, 'POST', M + `/pos/ofertas/${ofp.id}/publicar`, {}); check('publicar oferta', r.status === 200, r.text)
  r = await call(coord, 'GET', M + '/pos/ofertas-publicadas'); check('ofertas publicadas', r.status === 200 && r.json.length === 1, r.text)
  r = await call(coord, 'GET', M + `/pos/programas/${mest.id}/producao`); check('producao ppg', r.status === 200, r.text)
  r = await call(admB, 'GET', M + `/pos/programas/${mest.id}/producao`); check('producao tenant B 404', r.status === 404, r.text)
  r = await call(admB, 'POST', M + `/pos/alunos/${pa.id}/situacao`, { status: 'DESLIGADO', motivo: 'xxx' }); check('situacao tenant B 404', r.status === 404, r.text)
  r = await call(coord, 'GET', M + '/painel'); check('painel', r.status === 200, r.text)
  // jobs
  await prisma.modPosAluno.update({ where: { id: pl.id }, data: { prazoDeposito: new Date(Date.now() - 864e5) } })
  const j = await runEduJobs(); check('jobs ok', Object.values(j).every((x: any) => x.ok), Object.entries(j).filter(([, v]: any) => !v.ok))
  console.log('  jobs modalidades:', JSON.stringify(Object.fromEntries(Object.entries(j).filter(([k]) => k.startsWith('modalidades')).map(([k, v]: any) => [k, v.result]))))
  const j2 = await runEduJobs(); check('jobs 2x ok', Object.values(j2).every((x: any) => x.ok))
  const at3r = await prisma.modAtendimento.findUnique({ where: { id: at3.id } }); check('SLA vencido escalado pelo job', at3r?.status === 'ESCALADO', at3r?.status)
  const dd = await prisma.eduReminder.groupBy({ by: ['dedupeKey'], where: { tenantId: t1.tenantId, dedupeKey: { not: null } }, _count: true, having: { dedupeKey: { _count: { gt: 1 } } } }); check('sem lembrete duplicado', dd.length === 0)
  await close(); summary()
}
main().catch((e) => { console.error(e); process.exit(2) })
